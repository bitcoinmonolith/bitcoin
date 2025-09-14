import { Codec } from "@nomadshiba/struct-js";
import { BytesView } from "~/lib/BytesView.ts";
import { PeerMessage } from "~/lib/p2p/PeerMessage.ts";

const typeKeyToByte = {
	TX: 0x1,
	BLOCK: 0x2,
	FILTERED_BLOCK: 0x3,
	CMPCT_BLOCK: 0x4,

	WITNESS_TX: 0x40000001,
	WITNESS_BLOCK: 0x40000002,
	WITNESS_FILTERED_BLOCK: 0x40000003,
};

const typeByteToKey = new Map(
	Object.entries(typeKeyToByte).map(([key, value]) => [value, key as keyof typeof typeKeyToByte] as const),
);

export type GetDataMessage = {
	inventory: {
		type: keyof typeof typeKeyToByte;
		hash: Uint8Array;
	}[];
};

export class GetDataMessageCodec extends Codec<GetDataMessage> {
	public readonly stride = -1;

	public encode(data: GetDataMessage): Uint8Array {
		const count = data.inventory.length;
		if (count >= 0xfd) throw new Error("Too many inventory items");

		const bytes = new Uint8Array(1 + count * 36); // 1 varint + 36 per entry
		let offset = 0;

		bytes[offset++] = count;

		for (const item of data.inventory) {
			const view = new BytesView(bytes, offset, 36);
			view.setUint32(0, typeKeyToByte[item.type], true); // little-endian
			bytes.set(item.hash, offset + 4);
			offset += 36;
		}

		return bytes;
	}

	public decode(bytes: Uint8Array): GetDataMessage {
		let offset = 0;
		const count = bytes[offset++]!;
		const inventory = [];

		for (let i = 0; i < count; i++) {
			const view = new BytesView(bytes, offset, 36);
			const type = typeByteToKey.get(view.getUint32(0, true));
			if (!type) {
				throw new Error(`Unknown inventory type byte: ${view.getUint32(0, true)}`);
			}
			const hash = bytes.subarray(offset + 4, offset + 36);
			inventory.push({ type, hash });
			offset += 36;
		}

		return { inventory };
	}
}

export const GetDataMessage = new PeerMessage("getdata", new GetDataMessageCodec());
