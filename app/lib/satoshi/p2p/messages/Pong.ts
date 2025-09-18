import { Codec } from "@nomadshiba/struct-js";
import { BytesView } from "~/lib/BytesView.ts";
import { PeerMessage } from "~/lib/satoshi/p2p/PeerMessage.ts";

export type PongMessage = {
	nonce: bigint;
};

export class PongMessageCodec extends Codec<PongMessage> {
	public readonly stride = 8;

	public encode(data: PongMessage): Uint8Array {
		const bytes = new Uint8Array(8);
		const view = new BytesView(bytes);

		view.setBigUint64(0, data.nonce, true);

		return bytes;
	}

	public decode(bytes: Uint8Array): PongMessage {
		const view = new BytesView(bytes);

		return {
			nonce: view.getBigUint64(0, true),
		};
	}
}

export const PongMessage = new PeerMessage("pong", new PongMessageCodec());
