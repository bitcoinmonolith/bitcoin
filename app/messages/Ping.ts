import { Codec } from "@nomadshiba/struct-js";
import { BytesView } from "~/lib/BytesView.ts";
import { PeerMessage } from "~/lib/p2p/PeerMessage.ts";

export type PingMessage = {
	nonce: bigint;
};

export class PingMessageCodec extends Codec<PingMessage> {
	public readonly stride = 8;

	public encode(data: PingMessage): Uint8Array {
		const bytes = new Uint8Array(8);
		const view = new BytesView(bytes);

		view.setBigUint64(0, data.nonce, true);

		return bytes;
	}

	public decode(bytes: Uint8Array): PingMessage {
		const view = new BytesView(bytes);

		return {
			nonce: view.getBigUint64(0, true),
		};
	}
}

export const PingMessage = new PeerMessage("ping", new PingMessageCodec());
