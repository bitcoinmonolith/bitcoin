import { bytes, i32, Struct, u32, Vector } from "@nomadshiba/codec";
import { bytes32 } from "~/lib/primitives/Bytes32.ts";
import { StoredTxOutput } from "~/lib/chain//primitives/StoredTxOutput.ts";

// Per block optimizations like coinbase tx, doesn't save that much space,
// But its easy to implement so why not. Why store 0s randomly in the middle of the chunk?
export const StoredCoinbaseTx = new Struct({
	txId: bytes32,
	version: i32,
	lockTime: u32,
	sequence: u32,
	coinbase: bytes,
	vout: new Vector(StoredTxOutput),
});
