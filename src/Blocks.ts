export type Block = {
	hash: string;
	header: BlockHeader;
	data: Buffer;
};

export type BlockHeader = {
	version: number;
	prevHash: string; // hex, big-endian
	merkleRoot: string; // hex, big-endian
	timestamp: number; // Unix time
	bits: number; // compact difficulty
	nonce: number;
};

// BlockStore: block persistence
export abstract class BlockStore {
	abstract save(block: Block): void;
	abstract get(hash: string): Block | undefined;
	abstract has(hash: string): boolean;
}

// Chain: track best chain, forks, and height
export abstract class Chain {
	abstract addBlock(block: Block): void;
	abstract getBlock(hash: string): Block | undefined;
	abstract getTip(): BlockHeader;
	abstract getHeight(): number;
}

// BlockValidator: validates headers and blocks
export abstract class BlockValidator {
	abstract validate(block: Block): boolean;
	abstract validateHeader(header: BlockHeader): boolean;
}

// BlockParser: raw bytes to structured block/header
export abstract class BlockParser {
	abstract parseBlock(payload: Buffer): Block;
	abstract parseHeader(payload: Buffer): BlockHeader;
}
