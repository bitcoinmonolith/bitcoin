import { bytes, Codec, Enum, Struct, u32 } from "@nomadshiba/codec";
import { bytes32 } from "~/lib/primitives/Bytes32.ts";
import { u24 } from "~/lib/primitives/U24.ts";
import { StoredPointer } from "./StoredPointer.ts";
import { StoredWitness } from "./StoredWitness.ts";

export type StoredTxInput = Codec.Infer<typeof StoredTxInput>;
export const StoredTxInput = new Enum({
	resolved: new Struct({
		prevOut: new Struct({
			tx: StoredPointer,
			vout: u24,
		}),
		sequence: u32,
		scriptSig: bytes,
		witness: StoredWitness,
	}),
	unresolved: new Struct({
		prevOut: new Struct({
			txId: bytes32,
			vout: u24,
		}),
		sequence: u32,
		scriptSig: bytes,
		witness: StoredWitness,
	}),
});
