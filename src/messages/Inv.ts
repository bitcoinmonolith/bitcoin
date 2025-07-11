import { Peer } from "~/Peers.ts";
import { readUInt32LE, readUInt8, writeBytes, writeUInt32LE, writeUInt8 } from "../utils.ts";

export type InvVector = {
	type: number; // 1 = tx, 2 = block, etc.
	hash: Uint8Array; // 32 bytes
};

export type Inv = {
	inventory: InvVector[];
};

export const Inv: Peer.MessageType<Inv> = {
	command: "inv",

	serialize(data) {
		if (data.inventory.length >= 0xfd) {
			throw new Error("Inv serialization: CompactSize > 0xfc not implemented");
		}

		const count = data.inventory.length;
		const buffer = new Uint8Array(1 + count * 36);
		let offset = 0;

		writeUInt8(buffer, count, offset);
		offset += 1;

		for (const { type, hash } of data.inventory) {
			writeUInt32LE(buffer, type, offset);
			offset += 4;
			writeBytes(buffer, hash, offset);
			offset += 32;
		}

		return buffer;
	},

	deserialize(buffer) {
		let offset = 0;
		const count = readUInt8(buffer, offset++);
		const inventory: InvVector[] = [];

		for (let i = 0; i < count; i++) {
			const type = readUInt32LE(buffer, offset);
			offset += 4;
			const hash = buffer.subarray(offset, offset + 32);
			offset += 32;

			inventory.push({ type, hash });
		}

		return { inventory };
	},
};
