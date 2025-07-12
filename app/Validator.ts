import { Block } from "./Block.ts";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import { BytesView } from "./BytesView.ts";
import { BlockHeader } from "./BlockHeader.ts";

// Decode Bitcoin compact target ("bits") into bigint
function bits_to_target(bits: number): bigint {
	const exponent = bits >>> 24;
	const mantissa = bits & 0xffffff;
	return BigInt(mantissa) * (1n << (8n * BigInt(exponent - 3)));
}

// Double SHA256 of 80-byte header
function hash_header(header: BlockHeader): Uint8Array {
	const bytes = new Uint8Array(80);
	const view = BytesView(bytes);

	let offset = 0;
	view.setUint32(offset, header.version, true);
	offset += 4;

	bytes.set(header.prev_hash.reverse(), offset);
	offset += 32;

	bytes.set(header.merkle_root.reverse(), offset);
	offset += 32;

	view.setUint32(offset, header.timestamp, true);
	offset += 4;

	view.setUint32(offset, header.bits, true);
	offset += 4;

	view.setUint32(offset, header.nonce, true);
	offset += 4;

	return sha256(sha256(bytes));
}

export class Validator {
	validate_block_header(header: BlockHeader): boolean {
		if (!header.prev_hash || !header.merkle_root) return false;

		const now = Math.floor(Date.now() / 1000);
		if (header.timestamp > now + 2 * 60 * 60) return false;

		const hash_bytes = hash_header(header);
		const hash_int = BigInt(`0x${bytesToHex(hash_bytes.slice().reverse())}`);
		const target = bits_to_target(header.bits);

		return hash_int <= target;
	}

	validate_block(block: Block): boolean {
		return this.validate_block_header(block.header);
	}
}
