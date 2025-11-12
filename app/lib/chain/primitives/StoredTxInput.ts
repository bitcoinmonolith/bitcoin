import { bytes, Struct, u32 } from "@nomadshiba/codec";
import { u24 } from "~/lib/primitives/U24.ts";
import { StoredPointer } from "./StoredPointer.ts";

export const StoredTxInput = new Struct({
	prevOut: new Struct({
		tx: StoredPointer,
		vout: u24, // should be enough for vout based on max block weight
	}),
	sequence: u32,
	scriptSig: bytes,
	witness: bytes, // TODO: maybe seperate witness to another file? idk
});
