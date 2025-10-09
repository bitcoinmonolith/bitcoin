import { Codec } from "@nomadshiba/codec";
import { u48 } from "../../primitives/U48.ts";

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

// UPDATE:
// Ok i decided to use u24+24 instead of u16+u32.
// but they are stil chunkId and offset.
// so we have smaller chunks.
// BUT i realized we dont need a file per chunk.
// so u24 offset makes each chunk 16MB as max.
// actual chunk size will actually vary based on the size of the last block in the chunk
// but we can say there is 64 chunks per file. but we wont append them based on actual size.
// so we calculate where the chunk starts inside the file based on chunkId % 64 * 16MB, so we can directly find it.
// this way we can pick a file size for example 1GB more flexibly.

// so lets now think about another path we can go with this.
// what if we just had a single u48 offset number?
// we can say each file has to be 1GB max.
// so while calculating the offset we act like each file is 1GB, no matter the size of the last block in the file.
// if we dont do that offsets would shift between files.
// anyway so based on a single offset number we can find the file by offset / 1GB
// and inside the file we can find the offset by offset % 1GB
// so we can directly seek to the tx, block, scriptPubKey, etc.
// so this way we can have a single u48 number instead of two u24 numbers.
// this actually makes more sense.

export type BlockPointer = Codec.Infer<typeof BlockPointer>;
export const BlockPointer = u48;
