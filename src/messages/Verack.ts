import { Peer } from "~/Peers.js";

export type Verack = {};
export const Verack: Peer.MessageType<Verack> = {
	command: "verack",
	serialize: () => Buffer.alloc(0),
	deserialize: () => ({}),
};
