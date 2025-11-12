import { sha256 } from "@noble/hashes/sha2";
import { i32, Struct, u32 } from "@nomadshiba/codec";
import { bytes32 } from "~/lib/primitives/Bytes32.ts";

export type BlockHeader = Readonly<{
	hash: Uint8Array;
	version: number;
	prevHash: Uint8Array;
	merkleRoot: Uint8Array;
	timestamp: number;
	bits: number;
	nonce: number;
}>;

export class BlockHeaderCodec extends Struct<Omit<BlockHeader, "hash">> {
	constructor() {
		super({
			version: i32,
			prevHash: bytes32,
			merkleRoot: bytes32,
			timestamp: u32,
			bits: u32,
			nonce: u32,
		});
	}

	public override decode(bytes: Uint8Array): [BlockHeader, number] {
		if (bytes.length < this.stride) {
			throw new Error(`Not enough bytes to decode BlockHeader: need ${this.stride}, got ${bytes.length}`);
		}

		const [header, bytesRead] = super.decode(bytes);
		const hash = sha256(sha256(bytes.subarray(0, bytesRead)));
		return [{ ...header, hash }, bytesRead];
	}
}

export const BlockHeader = new BlockHeaderCodec();
