import { Peer } from "../Peer.ts";
import { BytesView } from "../BytesView.ts";

const type_key_to_byte = {
	TX: 1,
	BLOCK: 2,
};

const type_byte_to_key = new Map(
	Object.entries(type_key_to_byte).map(([key, value]) => [value, key as keyof typeof type_key_to_byte] as const),
);

export type InvVector = {
	type: keyof typeof type_key_to_byte; // 1 = tx, 2 = block, etc.
	hash: Uint8Array; // 32 bytes
};

export type Inv = {
	inventory: InvVector[];
};

export const Inv: Peer.Message<Inv> = {
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
			view.setUint32(offset, type_key_to_byte[type], true);
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
			const type = type_byte_to_key.get(view.getUint32(offset, true));
			if (!type) {
				throw new Error(`Unknown inventory type byte: ${view.getUint32(0, true)}`);
			}
			offset += 32 / 8;
			const hash = bytes.subarray(offset, offset + 32);
			offset += 32;

			inventory.push({ type, hash });
		}

		return { inventory };
	},
};
