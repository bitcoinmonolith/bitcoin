import { Codec, Struct } from "@nomadshiba/codec";
import { u24 } from "../../primitives/U24.ts";

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

export type BlockPointer = Codec.Infer<typeof BlockPointer>;
export const BlockPointer = new Struct({
	chunkId: u24,
	offset: u24,
});
