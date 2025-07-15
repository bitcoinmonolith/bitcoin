import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import { BytesView } from "./BytesView.ts";
import { BlockHeader } from "./types/BlockHeader.ts";
import { Block } from "./messages/Block.ts";

// Decode Bitcoin compact target ("bits") into bigint
function bitsToTarget(bits: number): bigint {
	const exponent = bits >>> 24;
	const mantissa = bits & 0xffffff;
	return BigInt(mantissa) * (1n << (8n * BigInt(exponent - 3)));
}

// Double SHA256 of 80-byte header
function hashHeader(header: BlockHeader): Uint8Array {
	const bytes = new Uint8Array(80);
	const view = BytesView(bytes);

	let offset = 0;
	view.setUint32(offset, header.version, true);
	offset += 4;

	bytes.set(header.prevHash.toReversed(), offset);
	offset += 32;

	bytes.set(header.merkleRoot.toReversed(), offset);
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
	validateBlockHeader(header: BlockHeader): boolean {
		if (!header.prevHash || !header.merkleRoot) return false;

		const now = Math.floor(Date.now() / 1000);
		if (header.timestamp > now + 2 * 60 * 60) return false;

		const hashBytes = hashHeader(header);
		const hashInt = BigInt(`0x${bytesToHex(hashBytes.slice().reverse())}`);
		const target = bitsToTarget(header.bits);

		return hashInt <= target;
	}

	validateBlock(block: Block): boolean {
		return this.validateBlockHeader(block.header);
	}
}
