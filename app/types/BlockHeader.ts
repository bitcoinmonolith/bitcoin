import { sha256 } from "@noble/hashes/sha2";
import { DataType } from "../DataType.ts";
import { BytesView } from "../BytesView.ts";

export type BlockHeader = {
	readonly hash: Uint8Array;
	readonly version: number;
	readonly prev_hash: Uint8Array;
	readonly merkle_root: Uint8Array;
	readonly timestamp: number;
	readonly bits: number;
	readonly nonce: number;
};

export const BlockHeader: DataType<BlockHeader> = {
	serialize(data) {
		const bytes = new Uint8Array(80);
		const view = BytesView(bytes);

		let offset = 0;

		view.setInt32(offset, data.version, true);
		offset += 4;

		bytes.set(data.prev_hash, offset);
		offset += 32;

		bytes.set(data.merkle_root, offset);
		offset += 32;

		view.setUint32(offset, data.timestamp, true);
		offset += 4;

		view.setUint32(offset, data.bits, true);
		offset += 4;

		view.setUint32(offset, data.nonce, true);
		offset += 4;

		return bytes;
	},

	deserialize(bytes) {
		const view = BytesView(bytes);
		let offset = 0;

		const start = offset;

		const version = view.getInt32(offset, true);
		offset += 4;

		const prev_hash = bytes.subarray(offset, offset + 32);
		offset += 32;

		const merkle_root = bytes.subarray(offset, offset + 32);
		offset += 32;

		const timestamp = view.getUint32(offset, true);
		offset += 4;

		const bits = view.getUint32(offset, true);
		offset += 4;

		const nonce = view.getUint32(offset, true);
		offset += 4;

		const header = bytes.subarray(start, offset);
		const hash = sha256(sha256(header)).slice().reverse(); // Bitcoin-style

		return {
			hash,
			version,
			prev_hash,
			merkle_root,
			timestamp,
			bits,
			nonce,
		};
	},
};
