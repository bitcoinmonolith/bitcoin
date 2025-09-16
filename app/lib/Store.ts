import { DB as Sqlite } from "@deno/sqlite";
import { Codec } from "@nomadshiba/struct-js";
import { DenoSqliteDialect } from "@soapbox/kysely-deno-sqlite";
import { dirname, join } from "@std/path";
import { Kysely, Transaction } from "kysely";
import { PartialTuple } from "./types.ts";

type KvSchema = { value: Uint8Array } & { [K in `key${number}`]: Uint8Array };
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
	public readonly valueCodec: Codec<V>;

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
	}

	public async get(key: PartialTuple<K>): Promise<V[]> {
		let query = this.database.selectFrom("kv").select(["value"]);
		for (const [i, k] of key.entries()) {
			query = query.where(`key${i}`, "=", this.keyCodecs[i]!.encode(k));
		}
		const rows = await query.execute();
		return rows.map((row) => this.valueCodec.decode(row.value));
	}

	public async getRaw(key: PartialTuple<K>): Promise<Uint8Array[]> {
		let query = this.database.selectFrom("kv").select(["value"]);
		for (const [i, k] of key.entries()) {
			query = query.where(`key${i}`, "=", this.keyCodecs[i]!.encode(k));
		}
		const rows = await query.execute();
		return rows.map((row) => row.value);
	}

	public async getMany(keys: PartialTuple<K>[] | ArrayIterator<K>): Promise<[K, V][]> {
		const keysArray = Array.isArray(keys) ? keys : Array.from(keys);
		let query = this.database.selectFrom("kv").select([
			"value",
			...this.keyCodecs.map((_, i) => `key${i}` as const),
		]);
		query = query.where((eb) =>
			eb.or(keysArray.map((key) => eb.and(key.map((k, i) => eb(`key${i}`, "=", this.keyCodecs[i]!.encode(k))))))
		);
		const rows = await query.execute();
		return rows.map((row) => {
			const key = this.keyCodecs.map((codec, i) => codec.decode(row[`key${i}`]!));
			const value = this.valueCodec.decode(row.value);
			return [key, value] as [K, V];
		});
	}

	public async set(key: K, value: V): Promise<boolean> {
		const values: any = { value: this.valueCodec.encode(value) };
		for (const [i, codec] of this.keyCodecs.entries()) {
			values[`key${i}`] = codec.encode(key[i]);
		}
		const result = await this.database
			.insertInto("kv")
			.values(values)
			.onConflict((oc) =>
				oc.columns(this.keyCodecs.keys().map((i) => `key${i}` as const).toArray())
					.doUpdateSet({ value: (eb) => eb.ref("excluded.value") })
			)
			.executeTakeFirstOrThrow();

		return Boolean(result.numInsertedOrUpdatedRows);
	}

	public async delete(key: PartialTuple<K>): Promise<boolean> {
		let query = this.database.deleteFrom("kv");
		for (const [i, k] of key.entries()) {
			query = query.where(`key${i}`, "=", this.keyCodecs[i]!.encode(k));
		}
		const result = await query.executeTakeFirstOrThrow();
		return Boolean(result.numDeletedRows);
	}

	public async clear(): Promise<boolean> {
		const result = await this.database
			.deleteFrom("kv")
			.executeTakeFirstOrThrow();
		return Boolean(result.numDeletedRows);
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
