import { Codec, Struct } from "@nomadshiba/codec";
import { u24 } from "../../primitives/U24.ts";

export type BlockPointer = Codec.Infer<typeof BlockPointer>;
export const BlockPointer = new Struct({
	chunkId: u24,
	offset: u24,
});
