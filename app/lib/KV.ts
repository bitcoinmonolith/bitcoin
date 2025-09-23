import { DB as Sqlite } from "@deno/sqlite";
import { Codec } from "@nomadshiba/codec";
import { DenoSqliteDialect } from "@soapbox/kysely-deno-sqlite";
import { dirname, join } from "@std/path";
import { CompiledQuery, Kysely, Transaction } from "kysely";
import { PartialTuple } from "./types.ts";

type KvSchema = { v: Uint8Array } & { [K in `k${number}`]: Uint8Array };
type DB = { kv: KvSchema };

type Key = readonly [unknown, ...unknown[]];
type Value = unknown;

export namespace KV {
	export type ConnectOptions = { base: string; name: string };
	export type Transaction<
		K extends Key = Key,
		V extends Value = Value,
	> = Omit<KV<K, V>, "transaction">;
}

type KCodec<K extends Key> =
	| { readonly [I in keyof K]: Codec<K[I]> }
	| { -readonly [I in keyof K]: Codec<K[I]> };

export class KV<
	const K extends Key = Key,
	V extends Value = Value,
> {
	public readonly kCodec: KCodec<K>;
	public readonly vCodec: Codec<V>;

	private readonly database: Kysely<DB> | Transaction<DB>;

	constructor(kCodec: KCodec<K>, vCodec: Codec<V>, options: KV.ConnectOptions) {
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

		// Never gonna happen but just in case
		new FinalizationRegistry((database: Kysely<DB>) => database.destroy()).register(this, database);
	}

	public async get(key: PartialTuple<K>): Promise<V[]> {
		let query = this.database.selectFrom("kv").select(["v"]);
		for (const [i, k] of key.entries()) {
			query = query.where(`k${i}`, "=", this.kCodec[i]!.encode(k));
		}
		const rows = await query.execute();
		return rows.map((row) => this.vCodec.decode(row.v));
	}

	public async getRaw(key: PartialTuple<K>): Promise<Uint8Array[]> {
		let query = this.database.selectFrom("kv").select(["v"]);
		for (const [i, k] of key.entries()) {
			query = query.where(`k${i}`, "=", this.kCodec[i]!.encode(k));
		}
		const rows = await query.execute();
		return rows.map((row) => row.v);
	}

	public async getMany(keys: PartialTuple<K>[]): Promise<[K, V][]> {
		let query = this.database.selectFrom("kv").select(["v", ...this.kCodec.map((_, i) => `k${i}` as const)]);
		query = query.where((eb) =>
			eb.or(keys.map((key) => eb.and(key.map((k, i) => eb(`k${i}`, "=", this.kCodec[i]!.encode(k))))))
		);
		const rows = await query.execute();
		return rows.map((row) => {
			const key = this.kCodec.map((codec, i) => codec.decode(row[`k${i}`]!)) as never as K;
			const value = this.vCodec.decode(row.v);
			return [key, value] as [K, V];
		});
	}

	public set(key: K, value: V): void {
		const values: any = { v: this.vCodec.encode(value) };
		for (let i = 0; i < this.kCodec.length; i++) {
			values[`k${i}`] = this.kCodec[i]!.encode(key[i]!);
		}

		this.database.insertInto("kv")
			.values(values)
			.onConflict((oc) => oc.doUpdateSet({ v: (eb) => eb.ref("excluded.v") }))
			.execute();
	}

	public async delete(key: PartialTuple<K>): Promise<void> {
		let query = this.database.deleteFrom("kv");
		for (const [i, k] of key.entries()) {
			query = query.where(`k${i}`, "=", this.kCodec[i]!.encode(k));
		}
		await query.execute();
	}

	public async clear(): Promise<void> {
		await this.database.deleteFrom("kv").execute();
	}
}
