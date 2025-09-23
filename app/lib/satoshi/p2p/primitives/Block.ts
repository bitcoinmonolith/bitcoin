import { concatBytes } from "@noble/hashes/utils";
import { Codec } from "@nomadshiba/codec";
import { equals } from "@std/bytes";
import { CompactSize } from "~/lib/CompactSize.ts";
import { BlockHeader } from "~/lib/satoshi/p2p/primitives/BlockHeader.ts";
import { Tx } from "~/lib/satoshi/p2p/primitives/Tx.ts";
import { humanize } from "~/lib/logging/human.ts";

export type Block = Readonly<{
	header: BlockHeader;
	txs: Tx[];
}>;

export class BlockCodec extends Codec<Block> {
	public readonly stride = -1;

	public encode(block: Block): Uint8Array {
		const { header, txs } = block;

		const headerBytes = BlockHeader.encode(header);

		const countBytes = CompactSize.encode(txs.length);

		const txsBytes = txs.map((tx) => Tx.encode(tx));

		return concatBytes(headerBytes, countBytes, ...txsBytes);
	}

	public decode(bytes: Uint8Array): Block {
		let offset = 0;

		const header = BlockHeader.decode(bytes.subarray(offset, offset + 80));
		offset += 80;

		const [txCount, off2] = CompactSize.decode(bytes, offset);
		offset = off2;

		const txs: Tx[] = [];
		for (let i = 0; i < txCount; i++) {
			const tx = Tx.decode(bytes.subarray(offset));
			const newOff = Tx.lastOffset;

			// TODO: Test, remove later
			const txBytes = bytes.subarray(offset, offset + newOff);
			const txEncoded = Tx.encode(tx);
			if (!equals(txBytes, txEncoded)) {
				console.error("Original bytes:", humanize(txBytes));
				console.error("Re-encoded bytes:", humanize(txEncoded));
				throw new Error("Tx encoding/decoding mismatch");
			}

			txs.push(tx);
			offset += newOff;
		}

		if (txs.length !== txCount) {
			throw new Error(`Transaction count mismatch: expected ${txCount}, got ${txs.length}`);
		}

		return { header, txs };
	}
}

export const Block = new BlockCodec();
