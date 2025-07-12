import { Peer } from "~/Peers.ts";
import { BytesView } from "../BytesView.ts";

export type Pong = { nonce: bigint };
export const Pong: Peer.MessageType<Pong> = {
	command: "pong",
	serialize(data) {
		const bytes = new Uint8Array(8);
		const view = BytesView(bytes);

		view.setBigUint64(0, data.nonce, true);

		return bytes;
	},
	deserialize(bytes) {
		const view = BytesView(bytes);

		return {
			nonce: view.getBigUint64(0, true),
		};
	},
};
