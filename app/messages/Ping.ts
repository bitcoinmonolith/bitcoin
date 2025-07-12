import { Peer } from "~/Peers.ts";
import { BytesView } from "../BytesView.ts";

export type Ping = { nonce: bigint };
export const Ping: Peer.MessageType<Ping> = {
	command: "ping",
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
