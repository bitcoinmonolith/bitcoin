import { Peer } from "../Peer.ts";

const typeKeyToByte = {
	TX: 1,
	BLOCK: 2,
	FILTERED_BLOCK: 3,
	CMPCT_BLOCK: 4,
};

const typeByteToKey = new Map(
	Object.entries(typeKeyToByte).map(([key, value]) => [value, key as keyof typeof typeKeyToByte] as const),
);

export type GetData = {
	inventory: {
		type: keyof typeof typeKeyToByte;
		hash: Uint8Array;
	}[];
};

export const GetData: Peer.Message<GetData> = {
	command: "getdata",

	serialize(data) {
		const count = data.inventory.length;
		if (count >= 0xfd) throw new Error("Too many inventory items");

		const bytes = new Uint8Array(1 + count * 36); // 1 varint + 36 per entry
		let offset = 0;

		bytes[offset++] = count;

		for (const item of data.inventory) {
			const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 36);
			view.setUint32(0, typeKeyToByte[item.type], true); // little-endian
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
			const type = typeByteToKey.get(view.getUint32(0, true));
			if (!type) {
				throw new Error(`Unknown inventory type byte: ${view.getUint32(0, true)}`);
			}
			const hash = bytes.slice(offset + 4, offset + 36);
			inventory.push({ type, hash });
			offset += 36;
		}

		return { inventory };
	},
};
