import { Codec } from "@nomadshiba/codec";
import { Block } from "~/lib/satoshi/primitives/Block.ts";
import { PeerMessage } from "~/lib/satoshi/p2p/PeerMessage.ts";

export type BlockMessage = {
	block: Block;
};

export class BlockMessageCodec extends Codec<BlockMessage> {
	public readonly stride = -1;

	public encode(data: BlockMessage): Uint8Array {
		return Block.encode(data.block);
	}

	public decode(bytes: Uint8Array): [BlockMessage, number] {
		const [block, bytesRead] = Block.decode(bytes);
		return [{ block }, bytesRead];
	}
}

export const BlockMessage = new PeerMessage("block", Block);
