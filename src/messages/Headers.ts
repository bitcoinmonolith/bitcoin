import { Peer } from "~/Peers.js";

export type Headers = {
	headers: Buffer[]; // each header is 80 bytes
};

export const Headers: Peer.MessageType<Headers> = {
	command: "headers",
	serialize(data) {
		const count = data.headers.length;
		const buf = Buffer.concat([
			Buffer.from([count]), // CompactSize works for small counts
			...data.headers.map((h) => Buffer.concat([h, Buffer.from([0])])), // headers + txn count (always 0)
		]);
		return buf;
	},
	deserialize(buffer) {
		const count = buffer[0]!;
		const headers: Buffer[] = [];

		let offset = 1;
		for (let i = 0; i < count; i++) {
			const header = buffer.subarray(offset, offset + 80);
			offset += 80 + 1; // skip 0 txn count
			headers.push(header);
		}

		return { headers };
	},
};
