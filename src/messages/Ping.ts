import { Message } from "~/Bitcoin.js";
import { Peer } from "~/Peers.js";
import { Pong } from "./Pong.js";
import { randomBytes } from "crypto";

export type Ping = { nonce: bigint };
export const Ping: Peer.MessageType<Ping> = {
	command: "ping",
	serialize(data) {
		const b = Buffer.alloc(8);
		b.writeBigUInt64LE(data.nonce);
		return b;
	},
	deserialize(buffer) {
		return {
			nonce: buffer.readBigUInt64LE(0),
		};
	},
};
