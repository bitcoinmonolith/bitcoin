import { Codec } from "@nomadshiba/codec";
import { PeerMessage } from "~/lib/satoshi/p2p/PeerMessage.ts";

export type GetAddrMessage = Record<string, never>; // Empty message

export class GetAddrMessageCodec extends Codec<GetAddrMessage> {
	public readonly stride = 0;

	public encode(_data: GetAddrMessage): Uint8Array {
		return new Uint8Array(0);
	}

	public decode(_bytes: Uint8Array): GetAddrMessage {
		return {};
	}
}

export const GetAddrMessage = new PeerMessage("getaddr", new GetAddrMessageCodec());
