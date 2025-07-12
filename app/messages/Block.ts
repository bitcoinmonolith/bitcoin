import { Peer } from "../Peers.ts";
import { Tx } from "../Tx.ts";

export type Block = {
	header: Uint8Array; // 80 bytes
	txs: Tx[]; // raw txs
};

export const Block: Peer.MessageType<Block> = {
	command: "block",

	serialize(data) {
		const { header, txs } = data;
		if (header.byteLength !== 80) throw new Error("Invalid block header");

		const txCount = txs.length;
		if (txCount >= 0xfd) throw new Error("Too many txs; varint > 0xfc not supported");

		const totalLength = 80 + 1 + txs.reduce((sum, tx) => sum + tx.length, 0);
		const bytes = new Uint8Array(totalLength);
		let offset = 0;

		bytes.set(header, offset);
		offset += 80;

		bytes[offset++] = txCount;

		for (const tx of txs) {
			bytes.set(tx, offset);
			offset += tx.length;
		}

		return bytes;
	},

	deserialize(bytes) {
		let offset = 0;
		const header = bytes.slice(offset, offset + 80);
		offset += 80;

		const txCount = bytes[offset++]!;
		const txs: Tx[] = [];

		for (let i = 0; i < txCount; i++) {
			const [tx, nextOffset] = Tx.parse(bytes, offset);
			txs.push(tx);
			offset = nextOffset;
		}

		return { header, txs };
	},
};
