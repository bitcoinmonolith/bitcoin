/// <reference lib="deno.worker" />

import { bool, bytes, Struct, u16, u32, Vector } from "@nomadshiba/codec";
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
	version: u32,
	lockTime: u32,
	vout: new Vector(StoredTxOutput),
	vin: new Vector(StoredTxInput),
});

self.onmessage = async (event) => {
};
