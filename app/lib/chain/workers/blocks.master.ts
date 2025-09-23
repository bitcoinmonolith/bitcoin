/// <reference lib="deno.worker" />

import { bool, bytes, i32, Struct, u16, u32, Vector } from "@nomadshiba/codec";
import { join } from "@std/path";
import { JobPool } from "../../JobPool.ts";
import { BASE_DATA_DIR } from "../../constants.ts";
import { bytes32 } from "../../primitives/Bytes32.ts";
import { u56 } from "../../primitives/U56.ts";
import { BlocksJobData, BlocksJobResult } from "./blocks.parallel.ts";
import { u24 } from "../../primitives/U24.ts";

const BASE_BLOCK_DIR = join(BASE_DATA_DIR, "blocks");

const jobPool = new JobPool<BlocksJobData, BlocksJobResult>(import.meta.resolve("./blocks.parallel.ts"));

/*
	Blocks are chunked, chunks are not based on height, but on size.
	It will proably will be 1GB per chunk, chunks need to be big enough, so chunkId can be u16.
	And chunks can should be small enough so maybe we can compress them in the future. (a compression that optimizes for speed)
	We have a fixed sized BlockHeightIndex, that we can directly check what chunkId and offset a block or tx is at.

	Chunk structure looks like this:
	[Tx Count: u24]
	[StoredCoinbaseTx]
	[StoredTx]
	[StoredTx]
	...
	[StoredTx]
	[Tx Count: u24]
	[StoredCoinbaseTx]
	[StoredTx]
	[StoredTx]
	...

	So as you can see, it only stores the txs,
	because we already store the headers in headers.dat file.
	And also headers always live in memory as well.

	So BlockHeightIndex points to the start of Tx Count of the chunk.
	That way a block can know how many of the following txs are its txs.

	vin pointing to prevout dont care about the block,
	so it directly points to chunkId and offset of the tx.
	it doesnt point to the output directly,
	because we need to know the txId as well,
	in order to reconstruct the on wire tx.

	Max chunk size can be changed dynamically in the future,
	and wouldn't require a reindex,
	because it only decides when to start a new chunk.
*/

const StoredTxOutput = new Struct({
	spent: bool,
	value: u56,
	scriptPubKey: bytes,
});

const StoredTxInput = new Struct({
	prevOut: new Struct({
		tx: new Struct({
			// I thought about pointing to blockHeight and blockOffset instead,
			// because offset would be 24bit instead.
			// but then i have to point to the blockHeight instead of chunkId,
			// meaning have to use u24 for blockHeight and u24 for blockOffset
			// but 16+32=24+24, so it takes the same space.
			// and this way i can directly go to the tx,
			// instead of checking where the block is first
			chunkId: u16,
			offset: u32,
		}),
		vout: u24, // should be enough for vout based on max block weight
	}),
	sequence: u32,
	scriptSig: bytes, // TODO: have internal id or something like that, they are usually repeated, maybe have a flag and point to the first one?
	witness: bytes, // TODO: maybe seperate witness to another file? idk
});

const StoredTx = new Struct({
	// This is the only place where we store the full txId,
	// if we dont store it anywhere else, in order to find the txId,
	// we have to hash every tx until the coinbase txs of the utxo we are spending.
	// this is only cheaper because txs usually have 2 or more outputs, including the change output,
	// so you at least repeat same txid twice in the inputs.
	// BUT if you dont spend it, and store the txid on the input you dont need the txid at all.
	// so this is only cheaper because there are more inputs spending from the same tx.
	// also, this method combined with offset pointing in the input, faster anyway.
	txId: bytes32,
	version: i32,
	lockTime: u32,
	vout: new Vector(StoredTxOutput),
	vin: new Vector(StoredTxInput),
});

const StoredCoinbaseTx = new Struct({
	txId: bytes32,
	version: i32,
	lockTime: u32,
	sequence: u32,
	coinbase: bytes,
	vout: new Vector(StoredTxOutput),
});

self.onmessage = async (event) => {
};
