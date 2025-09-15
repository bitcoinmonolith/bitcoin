import { Codec } from "@nomadshiba/struct-js";
import { PeerMessage } from "~/lib/p2p/PeerMessage.ts";

export type VerackMessage = null;

export class VerackMessageCodec extends Codec<VerackMessage> {
	public readonly stride = 0;

	public encode(_: VerackMessage): Uint8Array {
		return new Uint8Array(0);
	}

	public decode(_: Uint8Array): VerackMessage {
		return null;
	}
}

export const VerackMessage = new PeerMessage("verack", new VerackMessageCodec());
