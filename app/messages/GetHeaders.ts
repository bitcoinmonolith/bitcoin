import { Codec } from "@nomadshiba/struct-js";
import { BytesView } from "~/lib/BytesView.ts";
import { PeerMessage } from "~/lib/p2p/PeerMessage.ts";

export type GetHeadersMessage = {
	version: number;
	hashes: Uint8Array[]; // block locator hashes
	stopHash: Uint8Array;
};

export class GetHeadersMessageCodec extends Codec<GetHeadersMessage> {
	public readonly stride = -1;

	public encode(data: GetHeadersMessage): Uint8Array {
		const count = data.hashes.length;
		const bytes = new Uint8Array(4 + 1 + 32 * count + 32);
		const view = new BytesView(bytes);

		let offset = 0;

		view.setUint32(offset, data.version, true);
		offset += 32 / 8;

		// CompactSize count (assuming < 0xfd)
		if (count >= 0xfd) {
			throw new Error("Too many block locator hashes; CompactSize > 0xfc not supported here.");
		}

		view.setUint8(offset++, count);

		for (const hash of data.hashes) {
			if (hash.byteLength !== 32) throw new Error("Invalid hash length in locator");
			bytes.set(hash, offset);
			offset += hash.byteLength;
		}

		if (data.stopHash.byteLength !== 32) {
			throw new Error("Invalid stopHash length");
		}
		bytes.set(data.stopHash, offset);
		offset += data.stopHash.byteLength;

		return bytes.subarray(0, offset);
	}

	public decode(bytes: Uint8Array): GetHeadersMessage {
		const view = new BytesView(bytes);

		let offset = 0;

		const version = view.getUint32(offset, true);
		offset += 32 / 8;

		const count = view.getUint8(offset++);
		const hashes: Uint8Array[] = [];

		for (let i = 0; i < count; i++) {
			hashes.push(bytes.subarray(offset, offset + 32));
			offset += 32;
		}

		const stopHash = bytes.subarray(offset, offset + 32);
		offset += 32;

		return { version, hashes, stopHash };
	}
}

export const GetHeadersMessage = new PeerMessage("getheaders", new GetHeadersMessageCodec());
