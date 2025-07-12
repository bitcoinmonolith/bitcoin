import { Peer } from "../Peers.ts";

/** Inventory type: transaction (MSG_TX) — used to request or announce a single transaction */
export const MSG_TX = 1; /* expects tx */
/** Inventory type: block (MSG_BLOCK) — used to request or announce a full block */
export const MSG_BLOCK = 2; /* expects block */
/** Inventory type: filtered block (MSG_FILTERED_BLOCK) — used for BIP37 bloom-filtered blocks */
export const MSG_FILTERED_BLOCK = 3; /* expects merkleblock */
/** Inventory type: compact block (MSG_CMPCT_BLOCK) — used for BIP152 compact block relay */
export const MSG_CMPCT_BLOCK = 4; /* expects cmpctblock */

export type GetData = {
	inventory: {
		type: number;
		hash: Uint8Array;
	}[];
};

export const GetData: Peer.MessageType<GetData> = {
	command: "getdata",

	serialize(data) {
		const count = data.inventory.length;
		if (count >= 0xfd) throw new Error("Too many inventory items");

		const bytes = new Uint8Array(1 + count * 36); // 1 varint + 36 per entry
		let offset = 0;

		bytes[offset++] = count;

		for (const item of data.inventory) {
			const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 36);
			view.setUint32(0, item.type, true); // little-endian
			bytes.set(item.hash, offset + 4);
			offset += 36;
		}

		return bytes;
	},

	deserialize(bytes) {
		let offset = 0;
		const count = bytes[offset++]!;
		const inventory = [];

		for (let i = 0; i < count; i++) {
			const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 36);
			const type = view.getUint32(0, true);
			const hash = bytes.slice(offset + 4, offset + 36);
			inventory.push({ type, hash });
			offset += 36;
		}

		return { inventory };
	},
};
