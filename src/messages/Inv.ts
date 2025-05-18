import { Peer } from "~/Peers.js";

export type InvVector = {
	type: number; // 1 = tx, 2 = block, etc.
	hash: Buffer; // 32 bytes
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
		const buffer = Buffer.alloc(1 + count * 36);
		let offset = 0;

		buffer.writeUInt8(count, offset);
		offset += 1;

		for (const { type, hash } of data.inventory) {
			buffer.writeUInt32LE(type, offset);
			offset += 4;
			hash.copy(buffer, offset);
			offset += 32;
		}

		return buffer;
	},

	deserialize(buffer) {
		let offset = 0;
		const count = buffer.readUInt8(offset++);
		const inventory: InvVector[] = [];

		for (let i = 0; i < count; i++) {
			const type = buffer.readUInt32LE(offset);
			offset += 4;
			const hash = buffer.subarray(offset, offset + 32);
			offset += 32;

			inventory.push({ type, hash });
		}

		return { inventory };
	},
};
