import { Peer } from "../Peer.ts";

export type Verack = { [K in never]: never };
export const Verack: Peer.Message<Verack> = {
	command: "verack",
	serialize: () => new Uint8Array(0),
	deserialize: () => ({}),
};
