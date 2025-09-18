/// <reference lib="deno.worker" />

import { equals } from "@std/bytes";
import { BlockMessage } from "~/lib/satoshi/p2p/messages/Block.ts";
import { computeSatoshiMerkleRoot } from "../../satoshi/crypto/merkle.ts";
import { getTxId, getWTxId } from "../../primitives/Tx.ts";
import { bytesToHex } from "@noble/hashes/utils";

export type BlocksJobData = {
	blockBuffers: SharedArrayBuffer[];
};

export type BlocksJobResult =
	| { valid: true; txIds: SharedArrayBuffer; wtxIds: SharedArrayBuffer }
	| { valid: false; error?: string };

self.onmessage = (event) => {
	try {
		const { blockBuffers } = event.data as BlocksJobData;
		const blocks = blockBuffers.map((buf) => BlockMessage.codec.decode(new Uint8Array(buf)));

		const txCount = blocks.reduce((sum, block) => sum + block.txs.length, 0);

		const txIdsArr = new Uint8Array(new SharedArrayBuffer(txCount * 32));
		const wtxIdsArr = new Uint8Array(new SharedArrayBuffer(txCount * 32));

		let txOffset = 0;
		let wtxOffset = 0;

		for (const block of blocks) {
			const txIdsThisBlock: Uint8Array[] = [];

			// compute txids
			for (const tx of block.txs) {
				const txId = getTxId(tx);
				txIdsArr.set(txId, txOffset);
				txOffset += 32;
				txIdsThisBlock.push(txId);
			}

			// verify merkle root
			const merkleRoot = computeSatoshiMerkleRoot(txIdsThisBlock);
			if (!equals(merkleRoot, block.header.merkleRoot)) {
				const result: BlocksJobResult = {
					valid: false,
					error: `Merkle root mismatch: expected ${bytesToHex(block.header.merkleRoot.toReversed())}, got ${
						bytesToHex(merkleRoot.toReversed())
					}`,
				};
				self.postMessage(result);
				return;
			}

			// compute wtxids
			for (const tx of block.txs) {
				const wtxId = getWTxId(tx);
				wtxIdsArr.set(wtxId, wtxOffset);
				wtxOffset += 32;
			}
		}

		const result: BlocksJobResult = {
			valid: true,
			txIds: txIdsArr.buffer,
			wtxIds: wtxIdsArr.buffer,
		};
		self.postMessage(result);
	} catch (err) {
		const result: BlocksJobResult = {
			valid: false,
			error: String(err),
		};
		self.postMessage(result);
	}
};
