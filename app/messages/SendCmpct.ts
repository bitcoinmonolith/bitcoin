import { Peer } from "../Peer.ts";
import { BytesView } from "../BytesView.ts";

export type SendCmpct = {
	announce: boolean;
	version: bigint;
};

export const SendCmpct: Peer.Message<SendCmpct> = {
	command: "sendcmpct",
	serialize(data) {
		const bytes = new Uint8Array(9);
		const view = BytesView(bytes);

		view.setUint8(0, data.announce ? 1 : 0);
		view.setBigUint64(1, data.version, true);

		return bytes;
	},
	deserialize(bytes) {
		const view = BytesView(bytes);

		return {
			announce: view.getUint8(0) === 1,
			version: view.getBigUint64(1, true),
		};
	},
};
