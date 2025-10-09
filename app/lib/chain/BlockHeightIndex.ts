import { HeightStore } from "~/lib/chain/HeightStore.ts";
import { BlockPointer } from "./primitives/BlockPointer.ts";

export class BlockHeightIndex extends HeightStore<BlockPointer> {
	constructor(path: string) {
		super(BlockPointer, path);
	}
}
