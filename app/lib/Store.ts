import { DB as Sqlite } from "@deno/sqlite";
import { Codec, Tuple } from "@nomadshiba/struct-js";
import { DenoSqliteDialect } from "@soapbox/kysely-deno-sqlite";
import { dirname, join } from "@std/path";
import { Kysely, sql, Transaction } from "kysely";

type KvSchema = {
	key: Uint8Array;
	value: Uint8Array;
};
type DB = { kv: KvSchema };

export namespace Store {
	export type ConnectOptions = {
		base: string;
		name: string;
	};

	export type ManyOptions<K extends unknown[], V extends unknown> = {
		start?: K;
		end?: K;
		take?: number;
		skip?: number;
		keys?: K[] | ArrayIterator<K>;
	};

	export type Transaction<K extends unknown[] = any, V extends unknown = any> = Omit<Store<K, V>, "transaction">;
}

type KeyCodecs<K extends unknown[]> = { [I in keyof K]: Codec<K[I]> };

export class Store<
	K extends unknown[] = any,
	V extends unknown = any,
> {
	private readonly database: Kysely<DB> | Transaction<DB>;

	public readonly keyCodecs: KeyCodecs<K>;
	public readonly keyCodec: Codec<K>;
	public readonly valueCodec: Codec<V>;

	constructor(keyCodecs: KeyCodecs<K>, valueCodec: Codec<V>, options: Store.ConnectOptions) {
		this.keyCodecs = keyCodecs;
		this.keyCodec = new Tuple<KeyCodecs<K>>(keyCodecs);
		this.valueCodec = valueCodec;

		const filepath = join(options.base, `${options.name}.sqlite3`);
		Deno.mkdirSync(dirname(filepath), { recursive: true });

		const database = this.database = new Kysely({
			dialect: new DenoSqliteDialect({
				database: new Sqlite(filepath, { mode: "create" }),
				async onCreateConnection(connection) {
					await connection.executeQuery(sql`PRAGMA journal_mode = WAL`.compile(database));
					await connection.executeQuery(sql`PRAGMA busy_timeout = 5000`.compile(database));
					await connection.executeQuery(
						database.schema
							.createTable("kv")
							.ifNotExists()
							.addColumn("key", "blob", (col) => col.primaryKey())
							.addColumn("value", "blob", (col) => col.notNull())
							.compile(),
					);
				},
			}),
		});
		new FinalizationRegistry((database: Kysely<DB>) => database.destroy()).register(this, database);
	}

	public async get(key: K): Promise<V | undefined> {
		const key_bytes = this.keyCodec.encode(key);
		const row = await this.database
			.selectFrom("kv")
			.select(["value"])
			.where("key", "=", key_bytes)
			.executeTakeFirst();
		return row ? this.valueCodec.decode(row.value) : undefined;
	}

	public async getMany(keys: K[] | ArrayIterator<K>): Promise<V[]> {
		const keys_base64 = keys.map((key) => this.keyCodec.encode(key));
		const rows = await this.database
			.selectFrom("kv")
			.select(["key", "value"])
			.where("key", "in", Array.isArray(keys_base64) ? keys_base64 : keys_base64.toArray())
			.execute();
		return rows.map((row) => this.valueCodec.decode(row.value));
	}

	public async set(
		key: K,
		value: V,
		options: { createOnly?: boolean } = {},
	): Promise<boolean> {
		const key_bytes = this.keyCodec.encode(key);
		const value_bytes = this.valueCodec.encode(value);
		const result = await this.database
			.insertInto("kv")
			.values({ key: key_bytes, value: value_bytes })
			.onConflict((oc) => {
				if (options.createOnly) return oc.column("key").doNothing();
				return oc.column("key").doUpdateSet((eb) => ({ value: eb.ref("excluded.value") }));
			})
			.executeTakeFirstOrThrow();

		const createdOrUpdated = Boolean(result.numInsertedOrUpdatedRows);
		return createdOrUpdated;
	}

	public async delete(key: K): Promise<boolean> {
		const key_bytes = this.keyCodec.encode(key);
		const result = await this.database
			.deleteFrom("kv")
			.where("key", "=", key_bytes)
			.executeTakeFirstOrThrow();
		return Boolean(result.numDeletedRows);
	}

	public async clear(): Promise<boolean> {
		const result = await this.database
			.deleteFrom("kv")
			.executeTakeFirstOrThrow();
		return Boolean(result.numDeletedRows);
	}

	public async list(options: Store.ManyOptions<K, V> = {}): Promise<V[]> {
		let query = this.database.selectFrom("kv").select("value");

		if (options.keys) {
			const keys = options.keys.map((key) => this.keyCodec.encode(key));
			query = query.where("key", "in", Array.isArray(keys) ? keys : keys.toArray());
		}

		if (options.start) {
			query = query.where("key", ">=", this.keyCodec.encode(options.start));
		}

		if (options.end) {
			query = query.where("key", "<", this.keyCodec.encode(options.end));
		}

		if (options.take !== undefined) {
			query = query.limit(options.take);
		}

		if (options.skip !== undefined) {
			query = query.offset(options.skip);
		}

		const rows = await query.execute();

		return rows.map((row) => this.valueCodec.decode(row.value));
	}

	public transaction() {
		const execute = <T>(cb: (tx: Store.Transaction<K, V>) => Promise<T>): Promise<T> => {
			return this.database.transaction().execute((tx) => {
				const storeTx: Store.Transaction<K, V> = new Proxy({
					...this,
					database: tx,
					transaction() {
						throw new Error("Transactions cannot create other transactions");
					},
				}, {
					get: (target, prop, receiver) => {
						if (prop in target) {
							return Reflect.get(target, prop, receiver);
						}
						const value = this[prop as never] as unknown;
						if (typeof value === "function") {
							return value.bind(target);
						}
						return value;
					},
				});
				return cb(storeTx);
			});
		};
		return { execute };
	}
}

export namespace Store {
	type ToTransactions<T extends Store[] | Iterable<Store>> = T extends Iterable<Store<infer K, infer V>>
		? Store.Transaction<K, V>[]
		: { [I in keyof T]: T[I] extends Store<infer K, infer V> ? Store.Transaction<K, V> : never };

	export function transaction<S extends Store[] | Iterable<Store>>(stores: S) {
		type T = ToTransactions<S>;
		return {
			execute: <R>(callback: (...txs: T) => Promise<R>): Promise<R> => {
				const iter = stores[Symbol.iterator]();
				const txs: Store.Transaction[] = [];
				return nest(0);
				function nest(i: number): Promise<R> {
					const store = iter.next();
					if (store.done) return callback(...txs as T);
					return store.value.transaction().execute((tx) => (txs.push(tx), nest(i + 1)));
				}
			},
		};
	}
}
