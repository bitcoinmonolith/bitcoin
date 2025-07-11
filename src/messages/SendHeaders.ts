import { Peer } from "~/Peers.ts";

export type SendHeaders = {};
export const SendHeaders: Peer.MessageType<SendHeaders> = {
	command: "sendheaders",
	serialize: () => new Uint8Array(0),
	deserialize: () => ({}),
};
