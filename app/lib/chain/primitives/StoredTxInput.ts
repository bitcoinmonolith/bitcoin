import { bytes, Struct, u32 } from "@nomadshiba/codec";
import { u24 } from "~/lib/primitives/U24.ts";
import { StoredChainPointer } from "./StoredChainPointer.ts";

export const StoredTxInput = new Struct({
	prevOut: new Struct({
		tx: StoredChainPointer,
		vout: u24, // should be enough for vout based on max block weight
	}),
	sequence: u32,
	scriptSig: bytes,
	witness: bytes, // TODO: maybe seperate witness to another file? idk
});
