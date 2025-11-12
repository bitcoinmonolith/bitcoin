import { Codec } from "@nomadshiba/codec";
import { BytesView } from "~/lib/BytesView.ts";
import { PeerMessage } from "~/lib/satoshi/p2p/PeerMessage.ts";

export type SendCmpctMessage = {
	announce: boolean;
	version: bigint;
};

export class SendCmpctMessageCodec extends Codec<SendCmpctMessage> {
	public readonly stride = 9;

	public encode(data: SendCmpctMessage): Uint8Array {
		const bytes = new Uint8Array(9);
		const view = new BytesView(bytes);

		view.setUint8(0, data.announce ? 1 : 0);
		view.setBigUint64(1, data.version, true);

		return bytes;
	}

	public decode(bytes: Uint8Array): [SendCmpctMessage, number] {
		const view = new BytesView(bytes);

		return [
			{
				announce: view.getUint8(0) === 1,
				version: view.getBigUint64(1, true),
			},
			9,
		];
	}
}

export const SendCmpctMessage = new PeerMessage("sendcmpct", new SendCmpctMessageCodec());
