import { Codec, i32, Struct, u32 } from "@nomadshiba/struct-js";
import { sha256 } from "@noble/hashes/sha2";
import { bytes32 } from "~/lib//primitives/Bytes32.ts";

export type BlockHeader = Readonly<{
	version: number;
	prevHash: Uint8Array;
	merkleRoot: Uint8Array;
	timestamp: number;
	bits: number;
	nonce: number;
}>;

export class BlockHeaderCodec extends Codec<BlockHeader> {
	public readonly stride = 80;

	// Definition order matters here
	#struct = new Struct({
		version: i32,
		prevHash: bytes32,
		merkleRoot: bytes32,
		timestamp: u32,
		bits: u32,
		nonce: u32,
	});

	public encode(data: BlockHeader): Uint8Array {
		return this.#struct.encode(data);
	}

	public decode(bytes: Uint8Array): BlockHeader {
		if (bytes.length < this.stride) {
			throw new Error(`Not enough bytes to decode BlockHeader: need ${this.stride}, got ${bytes.length}`);
		}

		const header = this.#struct.decode(bytes);
		bytesCache.set(header, bytes);
		return header;
	}
}

export const BlockHeader = new BlockHeaderCodec();

const bytesCache = new WeakMap<BlockHeader, Uint8Array>();
const hashCache = new WeakMap<BlockHeader, Uint8Array>();
export function getBlockHash(header: BlockHeader): Uint8Array {
	let hash = hashCache.get(header);
	if (!hash) {
		let bytes = bytesCache.get(header);
		if (!bytes) {
			bytes = BlockHeader.encode(header);
			bytesCache.set(header, bytes);
		}
		hash = sha256(sha256(bytes));
		hashCache.set(header, hash);
	}
	return hash;
}
