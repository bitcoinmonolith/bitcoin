/// <reference lib="deno.worker" />

import { bytes, Struct, u16, u32, u64, Vector } from "@nomadshiba/codec";
import { join } from "@std/path";
import { JobPool } from "../../JobPool.ts";
import { Store } from "../../Store.ts";
import { BASE_DATA_DIR } from "../../constants.ts";
import { bytes32 } from "../../primitives/Bytes32.ts";
import { u24 } from "../../primitives/U24.ts";
import { BlocksJobData, BlocksJobResult } from "./blocks.parallel.ts";

const BASE_BLOCK_DIR = join(BASE_DATA_DIR, "blocks");

const jobPool = new JobPool<BlocksJobData, BlocksJobResult>(import.meta.resolve("./blocks.parallel.ts"));

const StoredTxOutput = new Struct({
	value: u64,
	scriptPubKey: bytes,
});

const StoredTxInput = new Struct({
	prevOut: new Struct({
		tx: new Struct({
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
	txId: bytes32,
	version: u32,
	lockTime: u64,
	vout: new Vector(StoredTxOutput),
	vin: new Vector(StoredTxInput),
});

const blockLocationIndex = new Store(
	[u24],
	new Struct({
		chunkId: u16,
		offset: u32,
	}),
	{ base: BASE_BLOCK_DIR, name: "block.index" },
);

self.onmessage = async (event) => {
};
