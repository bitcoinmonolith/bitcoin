import { Peer } from "~/Peers.ts";
import { concatBytes } from "../utils.ts";

export type Headers = {
	headers: Uint8Array[]; // each header is 80 bytes
};

export const Headers: Peer.MessageType<Headers> = {
	command: "headers",
	serialize(data) {
		const count = data.headers.length;
		const buf = concatBytes([
			new Uint8Array([count]), // CompactSize works for small counts
			...data.headers.flatMap((header) => [header, new Uint8Array([0])]), // headers + txn count (always 0)
		]);
		return buf;
	},
	deserialize(buffer) {
		const count = buffer[0]!;
		const headers: Uint8Array[] = [];

		let offset = 1;
		for (let i = 0; i < count; i++) {
			const header = buffer.subarray(offset, offset + 80);
			offset += 80 + 1; // skip 0 txn count
			headers.push(header);
		}

		return { headers };
	},
};
