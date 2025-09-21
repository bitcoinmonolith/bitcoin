/// <reference lib="deno.worker" />

import { Struct } from "@nomadshiba/struct-js";
import { equals } from "@std/bytes";
import { BlockMessage } from "~/lib/satoshi/p2p/messages/Block.ts";
import { humanize } from "../../logging/human.ts";
import { bytes32 } from "../../primitives/Bytes32.ts";
import { getTxId, getWTxId } from "../../primitives/Tx.ts";
import { u24 } from "../../primitives/U24.ts";
import { computeSatoshiMerkleRoot } from "../../satoshi/crypto/merkle.ts";

export const TxEntry = new Struct({
	txId: bytes32,
	wtxId: bytes32,
	offset: u24,
});

export type BlocksJobData = {
	blockBuffers: Uint8Array<SharedArrayBuffer>[];
};

export type BlocksJobResult =
	| { valid: true; txEntries?: Uint8Array<SharedArrayBuffer> }
	| { valid: false; error?: string };


	self.onmessage = (event) => {
		try {
			const { blockBuffers } = event.data as BlocksJobData;

			const txEntriesArr = new Uint8Array(new SharedArrayBuffer());
			
			for (const blockBuffer of blockBuffers) {
				const block = BlockMessage.codec.decode(blockBuffer);
				const blockTxIds: Uint8Array[] = [];

				txEntriesArr.buffer.grow(block.txs.length * TxEntry.stride);

				for (let txIndex = 0; txIndex < block.txs.length; txIndex++) {
					const tx = block.txs[txIndex]!;
					const txId = getTxId(tx);
					const wtxId = getWTxId(tx);
					const txOffset = 
					const entryOffset = txIndex * TxEntry.stride;
					txEntriesArr.set(txId, txIndex * TxEntry.stride);
					blockTxIds.push(txId);
				}

				// verify merkle root
				const merkleRoot = computeSatoshiMerkleRoot(blockTxIds);
				if (!equals(merkleRoot, block.header.merkleRoot)) {
					const result: BlocksJobResult = {
						valid: false,
						error: `Merkle root mismatch: expected ${humanize(block.header.merkleRoot)}, got ${
							humanize(merkleRoot)
						}`,
					};
					self.postMessage(result);
					return;
				}
			}

			const result: BlocksJobResult = { valid: true };
			self.postMessage(result);
		} catch (err) {
			const result: BlocksJobResult = { valid: false, error: String(err) };
			self.postMessage(result);
		}
	};

