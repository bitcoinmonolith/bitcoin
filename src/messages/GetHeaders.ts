import { Peer } from "~/Peers.ts";
import { readUInt32LE, readUInt8, writeBytes, writeUInt32LE, writeUInt8 } from "../utils.ts";

export type GetHeaders = {
	version: number;
	hashes: Uint8Array[]; // block locator hashes
	stopHash: Uint8Array;
};

export const GetHeaders: Peer.MessageType<GetHeaders> = {
	command: "getheaders",

	serialize(data) {
		const count = data.hashes.length;
		const header = new Uint8Array(4 + 1 + 32 * count + 32);

		let offset = 0;

		offset = writeUInt32LE(header, data.version, offset);

		// CompactSize count (assuming < 0xfd)
		if (count >= 0xfd) {
			throw new Error("Too many block locator hashes; CompactSize > 0xfc not supported here.");
		}
		offset = writeUInt8(header, count, offset);

		for (const hash of data.hashes) {
			if (hash.length !== 32) throw new Error("Invalid hash length in locator");
			offset = writeBytes(header, hash, offset)
			offset += 32;
		}

		if (data.stopHash.length !== 32) {
			throw new Error("Invalid stopHash length");
		}
		offset = writeBytes(header, data.stopHash, offset);

		return header.subarray(0, offset);
	},

	deserialize(buffer) {
		let offset = 0;

		const version = readUInt32LE(buffer, offset);
		offset += 4;

		const count = readUInt8(buffer, offset++);
		const hashes: Uint8Array[] = [];

		for (let i = 0; i < count; i++) {
			hashes.push(buffer.subarray(offset, offset + 32));
			offset += 32;
		}

		const stopHash = buffer.subarray(offset, offset + 32);
		offset += 32;

		return { version, hashes, stopHash };
	},
};
