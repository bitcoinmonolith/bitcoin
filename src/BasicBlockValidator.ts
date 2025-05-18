import { Block, BlockHeader, BlockValidator } from "./Blocks.js";
import { createHash } from "crypto";

// Decode Bitcoin compact target ("bits") into bigint
function bitsToTarget(bits: number): bigint {
	const exponent = bits >>> 24;
	const mantissa = bits & 0xffffff;
	const target = BigInt(mantissa) * (1n << (8n * BigInt(exponent - 3)));
	return target;
}

// Double SHA256 of 80-byte header
function hashHeader(header: BlockHeader): Buffer {
	const headerBuf = Buffer.alloc(80);
	let offset = 0;

	headerBuf.writeUInt32LE(header.version, offset);
	offset += 4;
	Buffer.from(header.prevHash, "hex").reverse().copy(headerBuf, offset);
	offset += 32;
	Buffer.from(header.merkleRoot, "hex").reverse().copy(headerBuf, offset);
	offset += 32;
	headerBuf.writeUInt32LE(header.timestamp, offset);
	offset += 4;
	headerBuf.writeUInt32LE(header.bits, offset);
	offset += 4;
	headerBuf.writeUInt32LE(header.nonce, offset);

	const hash1 = createHash("sha256").update(headerBuf).digest();
	const hash2 = createHash("sha256").update(hash1).digest();
	return hash2;
}

export class BasicBlockValidator extends BlockValidator {
	validateHeader(header: BlockHeader): boolean {
		if (!header.prevHash || !header.merkleRoot) return false;

		const now = Math.floor(Date.now() / 1000);
		if (header.timestamp > now + 2 * 60 * 60) return false;

		// Check PoW: hash must be <= target
		const hashBuf = hashHeader(header);
		const hashInt = BigInt("0x" + Buffer.from(hashBuf).reverse().toString("hex"));
		const target = bitsToTarget(header.bits);

		return hashInt <= target;
	}

	validate(block: Block): boolean {
		return this.validateHeader(block.header);
	}
}
