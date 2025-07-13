import { Peer } from "../Peer.ts";
import { BytesView } from "../BytesView.ts";

export type GetHeaders = {
	version: number;
	hashes: Uint8Array[]; // block locator hashes
	stopHash: Uint8Array;
};

export const GetHeaders: Peer.Message<GetHeaders> = {
	command: "getheaders",

	serialize(data) {
		const count = data.hashes.length;
		const bytes = new Uint8Array(4 + 1 + 32 * count + 32);
		const view = BytesView(bytes);

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
	},
	deserialize(bytes) {
		const view = BytesView(bytes);

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
	},
};
