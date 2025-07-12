import { Peer } from "~/Peers.ts";

export type Headers = {
	headers: Uint8Array[]; // each header is 80 bytes
};

export const Headers: Peer.MessageType<Headers> = {
	command: "headers",

	serialize(data) {
		const count = data.headers.length;

		if (count >= 0xfd) {
			throw new Error("Too many headers; CompactSize > 0xfc not supported.");
		}

		const totalSize = 1 + (80 + 1) * count; // 1 for count, 80 for header, 1 for tx count
		const bytes = new Uint8Array(totalSize);
		let offset = 0;

		bytes[offset++] = count;

		for (const header of data.headers) {
			if (header.byteLength !== 80) {
				throw new Error("Invalid header size");
			}
			bytes.set(header, offset);
			offset += 80;

			// tx count — always 0x00
			bytes[offset++] = 0x00;
		}

		return bytes;
	},

	deserialize(bytes) {
		let offset = 0;

		const count = bytes[offset++]!;
		const headers: Uint8Array[] = [];

		for (let i = 0; i < count; i++) {
			const header = bytes.subarray(offset, offset + 80);
			if (header.byteLength !== 80) {
				throw new Error("Incomplete header data");
			}
			offset += 80;

			const txCount = bytes[offset++];
			if (txCount !== 0x00) {
				throw new Error("Invalid tx count in headers message");
			}

			headers.push(header);
		}

		return { headers };
	},
};
