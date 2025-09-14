import { sha256 } from "@noble/hashes/sha2";
import { Codec, i32, Struct, u32 } from "@nomadshiba/struct-js";
import { bytes32 } from "~/lib//primitives/Bytes32.ts";

export type BlockHeader = {
	readonly hash: Uint8Array;
	readonly version: number;
	readonly prevHash: Uint8Array;
	readonly merkleRoot: Uint8Array;
	readonly timestamp: number;
	readonly bits: number;
	readonly nonce: number;
};

export class BlockHeaderCodec extends Codec<BlockHeader> {
	public readonly stride = 80;

	// Definition order matters here
	#inputCodec = new Struct({
		version: i32,
		prevHash: bytes32,
		merkleRoot: bytes32,
		timestamp: u32,
		bits: u32,
		nonce: u32,
	});

	public encode(data: BlockHeader): Uint8Array {
		return this.#inputCodec.encode(data);
	}

	public decode(bytes: Uint8Array): BlockHeader {
		if (bytes.length !== this.stride) {
			throw new Error(`BlockHeader must be ${this.stride} bytes long, got ${bytes.length}`);
		}

		const input = this.#inputCodec.decode(bytes);
		const hash = sha256(sha256(bytes));

		return {
			...input,
			hash,
		};
	}
}

export const BlockHeader = new BlockHeaderCodec();
