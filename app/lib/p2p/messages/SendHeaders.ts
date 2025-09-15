import { Codec } from "@nomadshiba/struct-js";
import { PeerMessage } from "~/lib/p2p/PeerMessage.ts";

export type SendHeadersMessage = null;

export class SendHeadersMessageCodec extends Codec<SendHeadersMessage> {
	public readonly stride = 0;

	public encode(_: SendHeadersMessage): Uint8Array {
		return new Uint8Array(0);
	}
	public decode(_: Uint8Array): SendHeadersMessage {
		return null;
	}
}

export const SendHeadersMessage = new PeerMessage("sendheaders", new SendHeadersMessageCodec());
