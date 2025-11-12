import { Codec } from "@nomadshiba/codec";
import { PeerMessage } from "~/lib/satoshi/p2p/PeerMessage.ts";

export type VerackMessage = null;

export class VerackMessageCodec extends Codec<VerackMessage> {
	public readonly stride = 0;

	public encode(_: VerackMessage): Uint8Array {
		return new Uint8Array(0);
	}

	public decode(_: Uint8Array): [VerackMessage, number] {
		return [null, 0];
	}
}

export const VerackMessage = new PeerMessage("verack", new VerackMessageCodec());
