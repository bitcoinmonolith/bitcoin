import { BlockHeader } from "../types/BlockHeader.ts";
import { Peer } from "../Peers.ts";
import { Tx } from "../types/Tx.ts";

export type Block = {
	header: BlockHeader;
	txs: Tx[];
};

export const Block: Peer.Message<Block> = {
	command: "block",
	serialize(data) {
		const { header, txs } = data;

		const headerBytes = BlockHeader.serialize(header);
		if (headerBytes.byteLength !== 80) {
			throw new Error("Invalid block header");
		}

		const txCount = txs.length;
		if (txCount >= 0xfd) {
			throw new Error("Too many txs; varint > 0xfc not supported");
		}

		const txsBytes = Tx.serialize(txs);

		const totalLength = 80 + 1 + txsBytes.length;
		const bytes = new Uint8Array(totalLength);

		let offset = 0;
		bytes.set(headerBytes, offset);
		offset += 80;

		bytes[offset++] = txCount;

		bytes.set(txsBytes, offset);

		return bytes;
	},

	deserialize(bytes) {
		let offset = 0;

		const header = BlockHeader.deserialize(bytes.subarray(offset, offset + 80));
		offset += 80;

		const txCount = bytes[offset++]!;
		const txs = Tx.deserialize(bytes.subarray(offset));

		if (txs.length !== txCount) {
			throw new Error(`Transaction count mismatch: expected ${txCount}, got ${txs.length}`);
		}

		return { header, txs };
	},
};
