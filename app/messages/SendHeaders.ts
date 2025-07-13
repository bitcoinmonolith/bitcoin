import { Peer } from "~/Peers.ts";

export type SendHeaders = { [K in never]: never };
export const SendHeaders: Peer.Message<SendHeaders> = {
	command: "sendheaders",
	serialize: () => new Uint8Array(0),
	deserialize: () => ({}),
};
