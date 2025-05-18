import { Block, BlockHeader, BlockParser } from "~/Blocks.js";
import { createHash } from "crypto";
import { doubleSha256 } from "~/utils.js";

export class BasicBlockParser extends BlockParser {
	parseHeader(payload: Buffer): BlockHeader {
		if (payload.length < 80) {
			throw new Error("Invalid block header: must be at least 80 bytes");
		}

		const version = payload.readUInt32LE(0);
		const prevHash = Buffer.from(payload.subarray(4, 36)).reverse().toString("hex");
		const merkleRoot = Buffer.from(payload.subarray(36, 68)).reverse().toString("hex");
		const timestamp = payload.readUInt32LE(68);
		const bits = payload.readUInt32LE(72);
		const nonce = payload.readUInt32LE(76);

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
