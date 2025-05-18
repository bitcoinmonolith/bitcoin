import { Block, BlockHeader, BlockParser } from "./Blocks.js";
import { createHash } from "crypto";

function doubleSha256(buf: Buffer): Buffer {
	const hash1 = createHash("sha256").update(buf).digest();
	return createHash("sha256").update(hash1).digest();
}

function readUInt32LE(buf: Buffer, offset: number): number {
	return buf.readUInt32LE(offset);
}

export class BasicBlockParser extends BlockParser {
	parseHeader(payload: Buffer): BlockHeader {
		if (payload.length < 80) {
			throw new Error("Invalid block header: must be at least 80 bytes");
		}

		const version = readUInt32LE(payload, 0);
		const prevHash = Buffer.from(payload.subarray(4, 36)).reverse().toString("hex");
		const merkleRoot = Buffer.from(payload.subarray(36, 68)).reverse().toString("hex");
		const timestamp = readUInt32LE(payload, 68);
		const bits = readUInt32LE(payload, 72);
		const nonce = readUInt32LE(payload, 76);

		return {
			version,
			prevHash,
			merkleRoot,
			timestamp,
			bits,
			nonce,
		};
	}

	parseBlock(payload: Buffer): Block {
		const headerBuf = payload.subarray(0, 80);
		const header = this.parseHeader(headerBuf);

		const hash = doubleSha256(headerBuf).reverse().toString("hex");

		return {
			hash,
			header,
			data: payload.subarray(80),
		};
	}
}
