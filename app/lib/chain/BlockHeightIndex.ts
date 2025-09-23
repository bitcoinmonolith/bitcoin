import { Codec, Struct } from "@nomadshiba/codec";
import { HeightStore } from "./HeightStore.ts";
import { u24 } from "../primitives/U24.ts";

type BlockLocation = Codec.Infer<typeof BlockLocation>;
const BlockLocation = new Struct({
	chunkId: u24,
	offset: u24,
});

export class BlockHeightIndex extends HeightStore<BlockLocation> {
	constructor(path: string) {
		super(BlockLocation, path);
	}
}
