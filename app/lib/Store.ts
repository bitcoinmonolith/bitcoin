import { DB as Sqlite } from "@deno/sqlite";
import { Codec } from "@nomadshiba/struct-js";
import { DenoSqliteDialect } from "@soapbox/kysely-deno-sqlite";
import { dirname, join } from "@std/path";
import { Kysely, Transaction } from "kysely";
import { PartialTuple } from "./types.ts";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

type KvSchema = { value: Uint8Array } & { [K in `key${number}`]: Uint8Array };
type DB = { kv: KvSchema };

export namespace Store {
	export type ConnectOptions = {
		base: string;
		name: string;
	};
}

type KeyCodecs<K extends readonly unknown[]> = { [I in keyof K]: Codec<K[I]> };

function array<T>(value: T | T[] | undefined): T[] {
	if (Array.isArray(value)) return value;
	if (value == null) return [];
	return [value];
}

export class Store<
	const K extends readonly unknown[] = any,
	V extends unknown = any,
> {
	public readonly keyCodecs: KeyCodecs<K>;
	public readonly valueCodec: Codec<V>;

	private readonly database: Kysely<DB> | Transaction<DB>;
	private readonly memory: Map<string, V>;
	private readonly prefixes: Map<string, Set<string>>[];

	private encodeKey(key: PartialTuple<K>): string {
		return key.map((k, i) => bytesToHex(this.keyCodecs[i]!.encode(k))).join(":");
	}

	constructor(keyCodecs: KeyCodecs<K>, valueCodec: Codec<V>, options: Store.ConnectOptions) {
		this.keyCodecs = keyCodecs;
		this.valueCodec = valueCodec;

		const filepath = join(options.base, `${options.name}.sqlite3`);
		Deno.mkdirSync(dirname(filepath), { recursive: true });

		const database = this.database = new Kysely({
			dialect: new DenoSqliteDialect({
				database: new Sqlite(filepath, { mode: "create" }),
				async onCreateConnection(connection) {
					let query = database.schema.createTable("kv").ifNotExists();
					for (const i of keyCodecs.keys()) {
						query = query.addColumn(`key${i}`, "blob", (col) => col.notNull());
					}
					query = query.addColumn("value", "blob", (col) => col.notNull());
					query = query.addPrimaryKeyConstraint(
						`pk_${options.name}`,
						keyCodecs.map((_, i) => `key${i}`) as never,
					);
					await connection.executeQuery(query.compile());
				},
			}),
		});
		new FinalizationRegistry((database: Kysely<DB>) => database.destroy()).register(this, database);

		this.memory = new Map();
		this.prefixes = keyCodecs.values().drop(1).map(() => new Map()).toArray();

		setInterval(() => this.flush(), 5_000);
	}

	public async get(key: PartialTuple<K>): Promise<V[]> {
		const memoryRows = key.length === this.keyCodecs.length
			? array(this.memory.get(this.encodeKey(key)))
			: this.prefixes[key.length - 1]!.get(this.encodeKey(key))?.values()
				.map((key) => this.memory.get(key))
				.filter((row) => row != null)
				.toArray() ?? [];

		let query = this.database.selectFrom("kv").select(["value"]);
		for (const [i, k] of key.entries()) {
			query = query.where(`key${i}`, "=", this.keyCodecs[i]!.encode(k));
		}
		const rows = await query.execute();
		return [...rows.map((row) => this.valueCodec.decode(row.value)), ...memoryRows];
	}

	public async getRaw(key: PartialTuple<K>): Promise<Uint8Array[]> {
		const memoryRows = (
			key.length === this.keyCodecs.length
				? array(this.memory.get(this.encodeKey(key)))
				: this.prefixes[key.length - 1]!.get(this.encodeKey(key))?.values()
					.map((key) => this.memory.get(key))
					.filter((row) => row != null)
					.toArray() ?? []
		).map((v) => this.valueCodec.encode(v!));

		let query = this.database.selectFrom("kv").select(["value"]);
		for (const [i, k] of key.entries()) {
			query = query.where(`key${i}`, "=", this.keyCodecs[i]!.encode(k));
		}
		const rows = await query.execute();
		return [...rows.map((row) => row.value), ...memoryRows];
	}

	public async getMany(keys: PartialTuple<K>[] | ArrayIterator<PartialTuple<K>>): Promise<[K, V][]> {
		const keysArray = Array.isArray(keys) ? keys : Array.from(keys);
		const memoryRows: [K, V][] = [];
		for (const key of keysArray) {
			if (key.length === this.keyCodecs.length) {
				const value = this.memory.get(this.encodeKey(key));
				if (value) memoryRows.push([key as K, value]);
			} else {
				const fullKeys = this.prefixes[key.length - 1]!.get(this.encodeKey(key)) ?? [];
				for (const fullKey of fullKeys) {
					const value = this.memory.get(fullKey)!;
					const fullKeyParts = fullKey.split(":").map((part, i) =>
						this.keyCodecs[i]!.decode(hexToBytes(part))
					) as never as K;
					memoryRows.push([fullKeyParts, value]);
				}
			}
		}

		let query = this.database.selectFrom("kv").select([
			"value",
			...this.keyCodecs.map((_, i) => `key${i}` as const),
		]);
		query = query.where((eb) =>
			eb.or(keysArray.map((key) => eb.and(key.map((k, i) => eb(`key${i}`, "=", this.keyCodecs[i]!.encode(k))))))
		);
		const rows = await query.execute();
		return [
			...rows.map((row) => {
				const key = this.keyCodecs.map((codec, i) => codec.decode(row[`key${i}`]!)) as never as K;
				const value = this.valueCodec.decode(row.value);
				return [key, value] as [K, V];
			}),
			...memoryRows,
		];
	}

	public async set(key: K, value: V): Promise<void> {
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
		let query = this.database.deleteFrom("kv");
		for (const [i, k] of key.entries()) {
			query = query.where(`key${i}`, "=", this.keyCodecs[i]!.encode(k));
		}
		await query.execute();
		if (key.length === this.keyCodecs.length) {
			const encodedKey = this.encodeKey(key as K);
			this.memory.delete(encodedKey);
			for (let i = 0; i < key.length - 1; i++) {
				const prefix = this.encodeKey(key.slice(0, i + 1) as never);
				const set = this.prefixes[i]!.get(prefix);
				if (set) {
					set.delete(encodedKey);
					if (set.size === 0) this.prefixes[i]!.delete(prefix);
				}
			}
		} else {
			const prefix = this.encodeKey(key);
			const fullKeys = this.prefixes[key.length - 1]!.get(prefix) ?? [];
			for (const fullKey of fullKeys) {
				this.memory.delete(fullKey);
				const fullKeyParts = fullKey.split(":").map((part, i) =>
					this.keyCodecs[i]!.decode(hexToBytes(part))
				) as never as K;
				for (let i = 0; i < fullKeyParts.length - 1; i++) {
					const p = this.encodeKey(fullKeyParts.slice(0, i + 1) as never);
					const set = this.prefixes[i]!.get(p);
					if (set) {
						set.delete(fullKey);
						if (set.size === 0) this.prefixes[i]!.delete(p);
					}
				}
			}
			this.prefixes[key.length - 1]!.delete(prefix);
		}
	}

	public async clear(): Promise<void> {
		await this.database.deleteFrom("kv").execute();
		this.memory.clear();
		this.prefixes.forEach((map) => map.clear());
	}

	public async flush(): Promise<void> {
		const entries = Array.from(this.memory.entries());
		while (entries.length > 0) {
			const chunk = entries.splice(0, 1000);
			const query = this.database.insertInto("kv").values(
				chunk.map(([encodedKey, value]) => {
					const keyParts = encodedKey.split(":").map((part, i) =>
						this.keyCodecs[i]!.decode(hexToBytes(part))
					);
					const obj: any = { value: this.valueCodec.encode(value) };
					keyParts.forEach((k, i) => obj[`key${i}`] = this.keyCodecs[i]!.encode(k));
					return obj;
				}),
			).onConflict((oc) =>
				oc.columns(this.keyCodecs.keys().map((i) => `key${i}` as const).toArray())
					.doUpdateSet({ value: (eb) => eb.ref("excluded.value") })
			);

			await query.execute();
		}
		this.memory.clear();
		this.prefixes.forEach((map) => map.clear());
	}
}
