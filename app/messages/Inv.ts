import { Peer } from "~/Peers.ts";
import { BytesView } from "../BytesView.ts";

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
		const bytes = new Uint8Array(1 + count * 36);
		const view = BytesView(bytes);

		let offset = 0;

		view.setUint8(offset, count);
		offset += 1;

		for (const { type, hash } of data.inventory) {
			view.setUint32(offset, type, true);
			offset += 4;
			bytes.set(hash, offset);
			offset += 32;
		}

		return bytes;
	},

	deserialize(bytes) {
		const view = BytesView(bytes);
		let offset = 0;

		const count = view.getUint8(offset++);
		const inventory: InvVector[] = [];

		for (let i = 0; i < count; i++) {
			const type = view.getUint32(offset, true);
			offset += 32 / 8;
			const hash = bytes.subarray(offset, offset + 32);
			offset += 32;

			inventory.push({ type, hash });
		}

		return { inventory };
	},
};
