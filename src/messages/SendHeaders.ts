import { Peer } from "~/Peers.js";

export type SendHeaders = {};
export const SendHeaders: Peer.MessageType<SendHeaders> = {
	command: "sendheaders",
	serialize: () => Buffer.alloc(0),
	deserialize: () => ({}),
};
