// This is where the compression and caching magic happens!

import { Tx } from "../types/Tx.ts";

export class BlockchainDB {
	constructor(
		public readonly rootDir: string,
		public readonly chunkSqliteDatabasePrototype: Uint8Array,
		public readonly indexSqliteDatabasePrototype: Uint8Array,
	) {}

	async putTx(tx: Tx): Promise<void> {
		throw new Error("Not implemented");
	}

	async putBlock(block: Tx[]): Promise<void> {
		throw new Error("Not implemented");
	}

	async getTxById(txId: string): Promise<Tx | null> {
		throw new Error("Not implemented");
	}

	async getBlockByHeight(height: number): Promise<Tx[] | null> {
		throw new Error("Not implemented");
	}

	async getBlockByHash(blockHash: string): Promise<Tx[] | null> {
		throw new Error("Not implemented");
	}

	async getLatestBlockHeight(): Promise<number> {
		throw new Error("Not implemented");
	}
}
