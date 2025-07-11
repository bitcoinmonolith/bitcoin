import { Block, BlockHeader, BlockValidator } from "~/Blocks.ts";
import { bytesToHex, hexToBytes, writeBytes, writeUInt32LE } from "./utils.ts";
import { sha256 } from "@noble/hashes/sha2";

// Decode Bitcoin compact target ("bits") into bigint
function bitsToTarget(bits: number): bigint {
	const exponent = bits >>> 24;
	const mantissa = bits & 0xffffff;
	const target = BigInt(mantissa) * (1n << (8n * BigInt(exponent - 3)));
	return target;
}

// Double SHA256 of 80-byte header
function hashHeader(header: BlockHeader): Uint8Array {
	const buffer = new Uint8Array(80);
	let offset = 0;

	writeUInt32LE(buffer, header.version, offset);
	offset += 4;
	writeBytes(buffer, hexToBytes(header.prevHash).reverse(), offset)
	offset += 32;
	writeBytes(buffer, hexToBytes(header.merkleRoot).reverse(), offset)
	offset += 32;
	writeUInt32LE(buffer, header.timestamp, offset);
	offset += 4;
	writeUInt32LE(buffer, header.bits, offset);
	offset += 4;
	writeUInt32LE(buffer, header.nonce, offset);

	const hash1 = sha256(buffer);
	const hash2 = sha256(hash1);
	return hash2;
}

export class BasicBlockValidator extends BlockValidator {
	validateHeader(header: BlockHeader): boolean {
		if (!header.prevHash || !header.merkleRoot) return false;

		const now = Math.floor(Date.now() / 1000);
		if (header.timestamp > now + 2 * 60 * 60) return false;

		// Check PoW: hash must be <= target
		const hashBuf = hashHeader(header);
		const hashInt = BigInt("0x" + bytesToHex(hashBuf.reverse()));
		const target = bitsToTarget(header.bits);

		return hashInt <= target;
	}

	validate(block: Block): boolean {
		return this.validateHeader(block.header);
	}
}
