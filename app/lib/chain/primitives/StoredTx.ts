import { Codec, i32, Struct, u32, Vector } from "@nomadshiba/codec";
import { bytes32 } from "~/lib/primitives/Bytes32.ts";
import { StoredTxOutput } from "~/lib/chain/primitives/StoredTxOutput.ts";
import { StoredTxInput } from "~/lib/chain/primitives/StoredTxInput.ts";

export type StoredTx = Codec.Infer<typeof StoredTx>;
export const StoredTx = new Struct({
	// This is the only place where we store the full txId,
	// if we dont store it anywhere else, in order to find the txId,
	// we have to hash every tx until the coinbase txs of the utxo we are spending.
	txId: bytes32,
	version: i32,
	lockTime: u32,
	vout: new Vector(StoredTxOutput),
	vin: new Vector(StoredTxInput),
});
