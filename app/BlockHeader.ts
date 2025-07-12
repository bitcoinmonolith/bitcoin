import { sha256 } from "@noble/hashes/sha2";
import { BytesView } from "./BytesView.ts";

export type BlockHeader = {
	readonly hash: Uint8Array;
	readonly version: number;
	readonly prev_hash: Uint8Array;
	readonly merkle_root: Uint8Array;
	readonly timestamp: number;
	readonly bits: number;
	readonly nonce: number;
};

export namespace BlockHeader {
	export type Init = {
		readonly version: number;
		readonly prev_hash: Uint8Array;
		readonly merkle_root: Uint8Array;
		readonly timestamp: number;
		readonly bits: number;
		readonly nonce: number;
	};

	export function create(init: BlockHeader.Init): BlockHeader {
		const bytes = new Uint8Array(80);
		const view = BytesView(bytes);

		let offset = 0;
		view.setUint32(offset, init.version, true);
		offset += 4;

		bytes.set(init.prev_hash.reverse(), offset);
		offset += 32;

		bytes.set(init.merkle_root.reverse(), offset);
		offset += 32;

		view.setUint32(offset, init.timestamp, true);
		offset += 4;

		view.setUint32(offset, init.bits, true);
		offset += 4;

		view.setUint32(offset, init.nonce, true);
		offset += 4;

		const hash = sha256(sha256(bytes)).reverse();

		return {
			...init,
			hash,
		};
	}

	export function from_bytes(bytes: Uint8Array): BlockHeader {
		if (bytes.length < 80) throw new Error("Invalid block header: must be at least 80 bytes");

		const view = BytesView(bytes);

		const hash = sha256(sha256(bytes)).reverse();

		const version = view.getUint32(0, true);
		const prevHash = bytes.slice(4, 36).reverse();
		const merkleRoot = bytes.slice(36, 68).reverse();
		const timestamp = view.getUint32(68, true);
		const bits = view.getUint32(72, true);
		const nonce = view.getUint32(76, true);

		return {
			hash,
			version,
			prev_hash: prevHash,
			merkle_root: merkleRoot,
			timestamp,
			bits,
			nonce,
		};
	}
}
