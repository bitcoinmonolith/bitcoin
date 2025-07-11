import { Peer } from "~/Peers.ts";
import { readUInt64LE, readUInt8, writeUInt64LE, writeUInt8 } from "../utils.ts";

export type SendCmpct = {
	announce: boolean;
	version: bigint;
};

export const SendCmpct: Peer.MessageType<SendCmpct> = {
	command: "sendcmpct",
	serialize(data) {
		const buffer = new Uint8Array(9);
		writeUInt8(buffer, data.announce ? 1 : 0, 0);
		writeUInt64LE(buffer, data.version, 1);
		return buffer;
	},
	deserialize(buffer) {
		return {
			announce: readUInt8(buffer, 0) === 1,
			version: readUInt64LE(buffer, 1),
		};
	},
};
