import { Codec, Struct } from "@nomadshiba/codec";
import { u24 } from "../../primitives/U24.ts";

export type BlockLocation = Codec.Infer<typeof BlockLocation>;
export const BlockLocation = new Struct({
	chunkId: u24,
	offset: u24,
});
