import { HeightStore } from "~/lib/chain/HeightStore.ts";
import { StoredChainPointer } from "./primitives/StoredChainPointer.ts";

export class BlockHeightIndex extends HeightStore<StoredChainPointer> {
	constructor(path: string) {
		super(StoredChainPointer, path);
	}
}
