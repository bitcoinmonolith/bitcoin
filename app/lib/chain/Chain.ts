import { ChainNode } from "./ChainNode.ts";

export class Chain implements Iterable<ChainNode> {
	private chain: ChainNode[];

	constructor(use: ChainNode[]) {
		this.chain = use;
	}

	[Symbol.iterator](): ArrayIterator<Readonly<ChainNode>> {
		return this.chain.values();
	}

	public entries(): ArrayIterator<[number, Readonly<ChainNode>]> {
		return this.chain.entries();
	}

	public values(): ArrayIterator<Readonly<ChainNode>> {
		return this.chain.values();
	}

	public getHeight(): number {
		return this.chain.length - 1;
	}

	public getTip(): ChainNode {
		return this.chain.at(-1)!;
	}

	public truncate(height: number): void {
		this.chain.length = height + 1;
	}

	public clear(): void {
		this.chain.length = 0;
	}

	public append(...headers: ChainNode[]): void {
		this.chain.push(...headers);
	}

	public at(height: number): ChainNode | undefined {
		return this.chain.at(height);
	}

	public get length(): number {
		return this.chain.length;
	}
}
