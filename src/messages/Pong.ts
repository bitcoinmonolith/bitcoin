import { Peer } from "~/Peers.js";

export type Pong = { nonce: bigint };
export const Pong: Peer.MessageType<Pong> = {
	command: "pong",
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
