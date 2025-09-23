/// <reference lib="deno.worker" />

import { bool, bytes, i32, Struct, u16, u32, Vector } from "@nomadshiba/codec";
import { join } from "@std/path";
import { JobPool } from "~/lib/JobPool.ts";
import { BASE_DATA_DIR } from "~/lib/constants.ts";
import { bytes32 } from "~/lib/primitives/Bytes32.ts";
import { u56 } from "~/lib/primitives/U56.ts";
import { BlocksJobData, BlocksJobResult } from "~/lib/chain/workers/blocks.parallel.ts";
import { u24 } from "~/lib/primitives/U24.ts";
import { StoredTxOutputValue } from "~/lib/chain/primitives/StoredTxOutputValueCodec.ts";

const BASE_BLOCK_DIR = join(BASE_DATA_DIR, "blocks");

const jobPool = new JobPool<BlocksJobData, BlocksJobResult>(import.meta.resolve("./blocks.parallel.ts"));

/*
	Blocks are chunked, chunks are not based on height, but on size.
	It will proably will be 1GB per chunk,
	chunks need to be big enough, so chunkId can be u16.
	And chunks can should be small enough,
	so maybe we can compress them in the future. (a compression that optimizes for speed)
	Also thats why I think about seperating witness data to another file,
	so compression can get better patterns.
	We have a fixed sized BlockHeightIndex,
	that we can directly check what chunkId and offset a block or tx is at.

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
	value: StoredTxOutputValue,

	// we will try things like these last and see if the it saves anything or does the opposite.
	// because we need an index, that might cost more space than it saves.
	scriptPubKey: bytes, // TODO: have internal id or something like that, they are usually repeated, maybe have a flag and point to the first one?
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
			//
			// this is only cheaper because there is always more inputs than txs.
			// based on my calculations, it should only save around 6GB for the whole blockchain.
			// but it also makes look ups easier and faster. so its a win win. even if one of the wins is small.
			// we will squeeze out every bit we can. one by one like this.
			chunkId: u16,
			offset: u32,
		}),
		vout: u24, // should be enough for vout based on max block weight
	}),
	sequence: u32,
	scriptSig: bytes,
	witness: bytes, // TODO: maybe seperate witness to another file? idk
});

const StoredTx = new Struct({
	// This is the only place where we store the full txId,
	// if we dont store it anywhere else, in order to find the txId,
	// we have to hash every tx until the coinbase txs of the utxo we are spending.
	txId: bytes32,
	version: i32,
	lockTime: u32,
	vout: new Vector(StoredTxOutput),
	vin: new Vector(StoredTxInput),
});

// Per block optimizations like coinbase tx, doesn't save that much space,
// But its easy to implement so why not. Why store 0s randomly in the middle of the chunk?
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
