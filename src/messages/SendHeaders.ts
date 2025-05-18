import { Message } from "~/Bitcoin.js";
import { Peer } from "~/Peers.js";

export type SendHeaders = {};
export const SendHeaders: Peer.MessageType<SendHeaders> = {
	command: "sendheaders",
	serialize: () => Buffer.alloc(0),
	deserialize: () => ({}),
};

export const SendHeadersHandler: Message<SendHeaders> = {
	type: SendHeaders,
	async handler({ peer }) {
		peer.log(`🪪 Peer prefers headers over inv`);
	},
};
