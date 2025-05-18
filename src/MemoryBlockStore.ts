import { Block, BlockStore } from "./Blocks.js";

export class MemoryBlockStore extends BlockStore {
	private store = new Map<string, Block>();

	save(block: Block): void {
		this.store.set(block.hash, block);
	}

	get(hash: string): Block | undefined {
		return this.store.get(hash);
	}

	has(hash: string): boolean {
		return this.store.has(hash);
	}
}
