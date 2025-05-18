import { Block, BlockHeader, Chain } from "./Blocks.js";

type ChainEntry = {
	block: Block;
	height: number;
	chainWork: bigint;
};

const FINALITY_DEPTH = 100; // blocks deeper than this can be pruned

export class MemoryChain extends Chain {
	private blocks = new Map<string, Block>();
	private entries = new Map<string, ChainEntry>();
	private tip: ChainEntry | null = null;

	addBlock(block: Block): void {
		const prevEntry = this.entries.get(block.header.prevHash);

		const height = prevEntry ? prevEntry.height + 1 : 0;
		const chainWork = prevEntry ? prevEntry.chainWork + 1n : 1n;

		const entry: ChainEntry = {
			block,
			height,
			chainWork,
		};

		this.blocks.set(block.hash, block);
		this.entries.set(block.hash, entry);

		// If it's the new best chain, update tip and prune
		if (!this.tip || entry.chainWork > this.tip.chainWork) {
			this.tip = entry;
			this.pruneStaleBlocks();
		}
	}

	getBlock(hash: string): Block | undefined {
		return this.blocks.get(hash);
	}

	getTip(): BlockHeader {
		if (!this.tip) throw new Error("No chain tip available");
		return this.tip.block.header;
	}

	getHeight(): number {
		return this.tip ? this.tip.height : -1;
	}

	private pruneStaleBlocks(): void {
		if (!this.tip) return;

		const mainChain = new Set<string>();
		let current: Block | undefined = this.tip.block;

		// Walk back N blocks from the tip to collect main chain
		for (let i = 0; i <= FINALITY_DEPTH && current; i++) {
			mainChain.add(current.hash);
			current = this.blocks.get(current.header.prevHash);
		}

		for (const [hash, entry] of this.entries.entries()) {
			const depth = this.tip.height - entry.height;

			if (!mainChain.has(hash) && depth > FINALITY_DEPTH) {
				this.blocks.delete(hash);
				this.entries.delete(hash);
			}
		}
	}
}
