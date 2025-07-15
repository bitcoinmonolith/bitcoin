import { Tx } from "../types/Tx.ts";

export class BlockchainDB {
	constructor(
		public readonly rootDir: string,
		public readonly chunkSqliteDatabasePrototype: Uint8Array,
		public readonly indexSqliteDatabasePrototype: Uint8Array,
	) {}

	async putTx(tx: Tx): Promise<void> {
	}

	async getTxByHash(txHash: string): Promise<Tx | null> {
	}
}
