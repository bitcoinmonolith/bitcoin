import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, concatBytes, hexToBytes, readUInt32LE, writeBytes, writeUInt32LE } from "./utils.ts";

export type BlockHeader = {
	readonly hash: string;
	readonly version: number;
	readonly prevHash: string;
	readonly merkleRoot: string;
	readonly timestamp: number;
	readonly bits: number;
	readonly nonce: number;
	readonly raw: Uint8Array;
};

export namespace BlockHeader {
	export type Init = {
		readonly version: number;
		readonly prevHash: string;
		readonly merkleRoot: string;
		readonly timestamp: number;
		readonly bits: number;
		readonly nonce: number;
	};

	export function create(init: BlockHeader.Init): BlockHeader {
		const buffer = new Uint8Array(80);
		let offset = 0;
		offset = writeUInt32LE(buffer, init.version, offset);
		offset = writeBytes(buffer, hexToBytes(init.prevHash).reverse(), offset);
		offset = writeBytes(buffer, hexToBytes(init.merkleRoot).reverse(), offset);
		offset = writeUInt32LE(buffer, init.timestamp, offset);
		offset = writeUInt32LE(buffer, init.bits, offset);
		offset = writeUInt32LE(buffer, init.nonce, offset);

		return {
			...init,
			hash: bytesToHex(sha256(sha256(buffer)).reverse()),
			raw: buffer,
		};
	}

	export function fromBuffer(buffer: Uint8Array): BlockHeader {
		if (buffer.length < 80) {
			throw new Error("Invalid block header: must be at least 80 bytes");
		}

		const hash = bytesToHex(sha256(sha256(buffer)).reverse());
		const version = readUInt32LE(buffer, 0);
		const prevHash = bytesToHex(buffer.subarray(4, 36).reverse());
		const merkleRoot = bytesToHex(buffer.subarray(36, 68).reverse());
		const timestamp = readUInt32LE(buffer, 68);
		const bits = readUInt32LE(buffer, 72);
		const nonce = readUInt32LE(buffer, 76);

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
	readonly body: Uint8Array;
	readonly raw: Uint8Array;
};
export namespace Block {
	export type Init = {
		readonly header: BlockHeader;
		readonly body: Uint8Array;
	};

	export function create(init: Block.Init): Block {
		return {
			...init,
			raw: concatBytes([init.header.raw, init.body]),
		};
	}

	export function fromBuffer(buffer: Uint8Array): Block {
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
	abstract has(hash: Uint8Array | string): boolean;
	abstract nextBlockHeader(hash: Uint8Array | string): { hash: string; raw: Uint8Array } | null;
}

// BlockValidator: validates headers and blocks
export abstract class BlockValidator {
	abstract validate(block: Block): boolean;
	abstract validateHeader(header: BlockHeader): boolean;
}
