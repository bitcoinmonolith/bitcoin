import { Peer } from "~/Peers.ts";
import { readUInt64LE, writeUInt64LE } from "../utils.ts";

export type Ping = { nonce: bigint };
export const Ping: Peer.MessageType<Ping> = {
	command: "ping",
	serialize(data) {
		const buffer = new Uint8Array(8);
		writeUInt64LE(buffer, data.nonce, 0);
		return buffer;
	},
	deserialize(buffer) {
		return {
			nonce: readUInt64LE(buffer, 0),
		};
	},
};
