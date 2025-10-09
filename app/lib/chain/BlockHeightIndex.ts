import { HeightStore } from "~/lib/chain/HeightStore.ts";
import { BlockLocation } from "./primitives/BlockPointer.ts";

export class BlockHeightIndex extends HeightStore<BlockLocation> {
	constructor(path: string) {
		super(BlockLocation, path);
	}
}
