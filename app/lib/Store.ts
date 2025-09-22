import { DB as Sqlite } from "@deno/sqlite";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { Codec } from "@nomadshiba/codec";
import { DenoSqliteDialect } from "@soapbox/kysely-deno-sqlite";
import { dirname, join } from "@std/path";
import { CompiledQuery, Kysely, Transaction } from "kysely";
import { PartialTuple } from "./types.ts";

type KvSchema = { v: Uint8Array } & { [K in `k${number}`]: Uint8Array };
type DB = { kv: KvSchema };

type Key = readonly [unknown, ...unknown[]];
type Value = unknown;

export namespace Store {
	export type ConnectOptions = { base: string; name: string };
	export type Transaction<
		K extends Key = Key,
		V extends Value = Value,
	> = Omit<Store<K, V>, "transaction">;
}

function array<T>(value: T | T[] | undefined): T[] {
	if (Array.isArray(value)) return value;
	if (value == null) return [];
	return [value];
}

type KCodec<K extends Key> =
	| { readonly [I in keyof K]: Codec<K[I]> }
	| { -readonly [I in keyof K]: Codec<K[I]> };

export class Store<
	const K extends Key = Key,
	V extends Value = Value,
> {
	public readonly kCodec: KCodec<K>;
	public readonly vCodec: Codec<V>;

	private readonly database: Kysely<DB> | Transaction<DB>;
	private memory: Map<string, V>;
	private prefixes: Map<string, Set<string>>[];
	private flushing: Promise<void>;

	private encodeKey(key: PartialTuple<K>): string {
		return key.map((k, i) => bytesToHex(this.kCodec[i]!.encode(k))).join(":");
	}

	constructor(kCodec: KCodec<K>, vCodec: Codec<V>, options: Store.ConnectOptions) {
		this.kCodec = kCodec;
		this.vCodec = vCodec;

		const filepath = join(options.base, `${options.name}.sqlite3`);
		Deno.mkdirSync(dirname(filepath), { recursive: true });

		const database = this.database = new Kysely({
			dialect: new DenoSqliteDialect({
				database: new Sqlite(filepath, { mode: "create" }),
				async onCreateConnection(connection) {
					await connection.executeQuery(CompiledQuery.raw("PRAGMA journal_mode = WAL;"));
					await connection.executeQuery(CompiledQuery.raw("PRAGMA busy_timeout = 5000;"));
					await connection.executeQuery(CompiledQuery.raw("PRAGMA synchronous = NORMAL;"));
					await connection.executeQuery(CompiledQuery.raw("PRAGMA temp_store = MEMORY;"));
					await connection.executeQuery(CompiledQuery.raw("PRAGMA mmap_size = 1073741824;"));
					await connection.executeQuery(CompiledQuery.raw("PRAGMA cache_size = -131072;"));
					await connection.executeQuery(CompiledQuery.raw("PRAGMA foreign_keys = OFF;"));
					await connection.executeQuery(CompiledQuery.raw("PRAGMA locking_mode = EXCLUSIVE;"));

					let query = database.schema.createTable("kv").ifNotExists();
					for (const i of kCodec.keys()) {
						query = query.addColumn(`k${i}`, "blob", (col) => col.notNull());
					}
					query = query.addColumn("v", "blob", (col) => col.notNull());
					query = query.addPrimaryKeyConstraint(`pk`, kCodec.map((_, i) => `k${i}`) as never);
					await connection.executeQuery(query.compile());
				},
			}),
		});
		new FinalizationRegistry((database: Kysely<DB>) => database.destroy()).register(this, database);

		this.memory = new Map();
		this.prefixes = kCodec.values().drop(1).map(() => new Map()).toArray();
		this.flushing = Promise.resolve();

		setInterval(() => this.flushing = this.flushing.then(() => this.flush()), 5_000);
	}

	public async get(key: PartialTuple<K>): Promise<V[]> {
		const memoryRows = key.length === this.kCodec.length
			? array(this.memory.get(this.encodeKey(key)))
			: this.prefixes[key.length - 1]!.get(this.encodeKey(key))?.values()
				.map((key) => this.memory.get(key))
				.filter((row) => row != null)
				.toArray() ?? [];

		let query = this.database.selectFrom("kv").select(["v"]);
		for (const [i, k] of key.entries()) {
			query = query.where(`k${i}`, "=", this.kCodec[i]!.encode(k));
		}
		const rows = await query.execute();
		return [...memoryRows, ...rows.map((row) => this.vCodec.decode(row.v))];
	}

	public async getRaw(key: PartialTuple<K>): Promise<Uint8Array[]> {
		const memoryRows = (
			key.length === this.kCodec.length
				? array(this.memory.get(this.encodeKey(key)))
				: this.prefixes[key.length - 1]!.get(this.encodeKey(key))?.values()
					.map((key) => this.memory.get(key))
					.filter((row) => row != null)
					.toArray() ?? []
		).map((v) => this.vCodec.encode(v!));

		let query = this.database.selectFrom("kv").select(["v"]);
		for (const [i, k] of key.entries()) {
			query = query.where(`k${i}`, "=", this.kCodec[i]!.encode(k));
		}
		const rows = await query.execute();
		return [...memoryRows, ...rows.map((row) => row.v)];
	}

	public async getMany(keys: PartialTuple<K>[]): Promise<[K, V][]> {
		const memoryRows: [K, V][] = [];
		for (const key of keys) {
			if (key.length === this.kCodec.length) {
				const value = this.memory.get(this.encodeKey(key));
				if (value) memoryRows.push([key as K, value]);
			} else {
				const fullKeys = this.prefixes[key.length - 1]!.get(this.encodeKey(key)) ?? [];
				for (const fullKey of fullKeys) {
					const value = this.memory.get(fullKey)!;
					const fullKeyParts = fullKey.split(":").map((part, i) =>
						this.kCodec[i]!.decode(hexToBytes(part))
					) as never as K;
					memoryRows.push([fullKeyParts, value]);
				}
			}
		}

		let query = this.database.selectFrom("kv").select(["v", ...this.kCodec.map((_, i) => `k${i}` as const)]);
		query = query.where((eb) =>
			eb.or(keys.map((key) => eb.and(key.map((k, i) => eb(`k${i}`, "=", this.kCodec[i]!.encode(k))))))
		);
		const rows = await query.execute();
		return [
			...memoryRows,
			...rows.map((row) => {
				const key = this.kCodec.map((codec, i) => codec.decode(row[`k${i}`]!)) as never as K;
				const value = this.vCodec.decode(row.v);
				return [key, value] as [K, V];
			}),
		];
	}

	public set(key: K, value: V): void {
		const encodedKey = this.encodeKey(key);
		this.memory.set(encodedKey, value);
		for (let i = 0; i < key.length - 1; i++) {
			const prefix = this.encodeKey(key.slice(0, i + 1) as never);
			let set = this.prefixes[i]!.get(prefix);
			if (!set) {
				set = new Set();
				this.prefixes[i]!.set(prefix, set);
			}
			set.add(encodedKey);
		}
	}

	public async delete(key: PartialTuple<K>): Promise<void> {
		await this.flushing;

		let query = this.database.deleteFrom("kv");
		for (const [i, k] of key.entries()) {
			query = query.where(`k${i}`, "=", this.kCodec[i]!.encode(k));
		}
		await query.execute();

		if (key.length === this.kCodec.length) {
			const encodedKey = this.encodeKey(key as K);
			this.memory.delete(encodedKey);
		} else {
			const prefix = this.encodeKey(key);
			const keys = this.prefixes[key.length - 1]!.get(prefix) ?? [];
			for (const key of keys) {
				this.memory.delete(key);
			}
		}
	}

	public async clear(): Promise<void> {
		this.memory.clear();
		this.prefixes.forEach((map) => map.clear());
		await this.database.deleteFrom("kv").execute();
	}

	public async flush(): Promise<void> {
		const memory = this.memory;
		this.memory = new Map();
		this.prefixes.forEach((set) => set.clear());

		const entries = Array.from(memory.entries());
		while (entries.length > 0) {
			const chunk = entries.splice(0, 1000);
			const query = this.database.insertInto("kv").values(
				chunk.map(([encodedKey, value]) => {
					const values: any = { v: this.vCodec.encode(value) };
					const keyParts = encodedKey.split(":");
					for (let i = 0; i < this.kCodec.length; i++) {
						values[`k${i}`] = hexToBytes(keyParts[i]!);
					}
					return values;
				}),
			).onConflict((oc) =>
				oc.columns(this.kCodec.keys().map((i) => `k${i}` as const).toArray())
					.doUpdateSet({ v: (eb) => eb.ref("excluded.v") })
			);

			await query.execute();
		}
	}
}
