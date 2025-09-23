import { bytes, Struct, u16, u32 } from "@nomadshiba/codec";
import { u24 } from "~/lib/primitives/U24.ts";

export const StoredTxInput = new Struct({
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
