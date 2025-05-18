import { doubleSha256, writeBuffer } from "./utils.js";

export type BlockHeader = {
	readonly hash: string;
	readonly version: number;
	readonly prevHash: string;
	readonly merkleRoot: string;
	readonly timestamp: number;
	readonly bits: number;
	readonly nonce: number;
	readonly raw: Buffer;
};
export namespace BlockHeader {
	export type Init = {
		readonly hash: string;
		readonly version: number;
		readonly prevHash: string;
		readonly merkleRoot: string;
		readonly timestamp: number;
		readonly bits: number;
		readonly nonce: number;
	};

	export function create(init: BlockHeader.Init): BlockHeader {
		const buffer = Buffer.alloc(80);
		let offset = 0;
		offset = buffer.writeUInt32LE(init.version, offset);
		offset = writeBuffer(buffer, Buffer.from(init.prevHash, "hex").reverse(), offset);
		offset = writeBuffer(buffer, Buffer.from(init.merkleRoot, "hex").reverse(), offset);
		offset = buffer.writeUInt32LE(init.timestamp, offset);
		offset = buffer.writeUInt32LE(init.bits, offset);
		offset = buffer.writeUInt32LE(init.nonce, offset);

		return {
			...init,
			raw: buffer,
		};
	}

	export function fromBuffer(buffer: Buffer): BlockHeader {
		if (buffer.length < 80) {
			throw new Error("Invalid block header: must be at least 80 bytes");
		}

		const hash = doubleSha256(buffer).reverse().toString("hex");
		const version = buffer.readUInt32LE(0);
		const prevHash = Buffer.from(buffer.subarray(4, 36)).reverse().toString("hex");
		const merkleRoot = Buffer.from(buffer.subarray(36, 68)).reverse().toString("hex");
		const timestamp = buffer.readUInt32LE(68);
		const bits = buffer.readUInt32LE(72);
		const nonce = buffer.readUInt32LE(76);

		return {
			hash,
			version,
			prevHash,
			merkleRoot,
			timestamp,
			bits,
			nonce,
			raw: buffer,
		};
	}
}

export type Block = {
	readonly header: BlockHeader;
	readonly body: Buffer;
	readonly raw: Buffer;
};
export namespace Block {
	export type Init = {
		readonly header: BlockHeader;
		readonly body: Buffer;
	};

	export function create(init: Block.Init): Block {
		return {
			...init,
			raw: Buffer.concat([init.header.raw, init.body]),
		};
	}

	export function fromBuffer(buffer: Buffer): Block {
		const headerBuffer = buffer.subarray(0, 80);
		const header = BlockHeader.fromBuffer(headerBuffer);

		return {
			header,
			body: buffer.subarray(80),
			raw: buffer,
		};
	}
}

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
	abstract has(hash: Buffer | string): boolean;
	abstract nextBlockHeader(hash: Buffer | string): { hash: string; raw: Buffer } | null;
}

// BlockValidator: validates headers and blocks
export abstract class BlockValidator {
	abstract validate(block: Block): boolean;
	abstract validateHeader(header: BlockHeader): boolean;
}
