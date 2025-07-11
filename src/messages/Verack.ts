import { Peer } from "~/Peers.ts";

export type Verack = {};
export const Verack: Peer.MessageType<Verack> = {
	command: "verack",
	serialize: () => new Uint8Array(0),
	deserialize: () => ({}),
};
