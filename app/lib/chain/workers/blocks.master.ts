/// <reference lib="deno.worker" />

import { bool, bytes, Struct, u16, u32, u64, Vector } from "@nomadshiba/codec";
import { join } from "@std/path";
import { JobPool } from "../../JobPool.ts";
import { BASE_DATA_DIR } from "../../constants.ts";
import { bytes32 } from "../../primitives/Bytes32.ts";
import { u56 } from "../../primitives/U56.ts";
import { BlocksJobData, BlocksJobResult } from "./blocks.parallel.ts";

const BASE_BLOCK_DIR = join(BASE_DATA_DIR, "blocks");

const jobPool = new JobPool<BlocksJobData, BlocksJobResult>(import.meta.resolve("./blocks.parallel.ts"));

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
		vout: u16,
	}),
	sequence: u64,
	scriptSig: bytes,
	witness: bytes,
});

const StoredTx = new Struct({
	// This is the only place where we store the full txId,
	// if we dont store it anywhere else, in order to find the txId,
	// we have to hash every tx until the coinbase txs of the utxo we are spending.
	txId: bytes32,
	version: u32,
	lockTime: u64,
	vout: new Vector(StoredTxOutput),
	vin: new Vector(StoredTxInput),
});

self.onmessage = async (event) => {
};
