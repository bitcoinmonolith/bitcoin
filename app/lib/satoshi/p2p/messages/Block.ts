import { Codec } from "@nomadshiba/struct-js";
import { Block } from "~/lib/primitives/Block.ts";
import { PeerMessage } from "~/lib/satoshi/p2p/PeerMessage.ts";

export type BlockMessage = {
	block: Block;
};

export class BlockMessageCodec extends Codec<BlockMessage> {
	public readonly stride = -1;

	public encode(data: BlockMessage): Uint8Array {
		return Block.encode(data.block);
	}

	public decode(bytes: Uint8Array): BlockMessage {
		return { block: Block.decode(bytes) };
	}
}

export const BlockMessage = new PeerMessage("block", Block);
