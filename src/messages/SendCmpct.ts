import { Message } from "~/Bitcoin.js";
import { Peer } from "~/Peers.js";

export type SendCmpct = {
	announce: boolean;
	version: bigint;
};

export const SendCmpct: Peer.MessageType<SendCmpct> = {
	command: "sendcmpct",
	serialize(data) {
		const b = Buffer.alloc(9);
		b.writeUInt8(data.announce ? 1 : 0, 0);
		b.writeBigUInt64LE(data.version, 1);
		return b;
	},
	deserialize(buffer) {
		return {
			announce: buffer.readUInt8(0) === 1,
			version: buffer.readBigUInt64LE(1),
		};
	},
};

export const SendCmpctHandler: Message<SendCmpct> = {
	type: SendCmpct,
	async handler({ peer, data }) {
		peer.log(`📦 Received sendcmpct → announce=${data.announce}, version=${data.version}`);
	},
};
