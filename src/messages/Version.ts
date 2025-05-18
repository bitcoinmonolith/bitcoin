import { Message, Bitcoin } from "~/Bitcoin.js";
import { Peer } from "~/Peers.js";
import { writeBuffer, zeroPad16 } from "~/utils.js";
import { Verack } from "./Verack.js";

export type Version = {
	version: number;
	services: bigint;
	timestamp: bigint;
	recvServices: bigint;
	recvPort: number;
	transServices: bigint;
	transPort: number;
	nonce: bigint;
	userAgent: string;
	startHeight: number;
	relay: boolean;
};

export const Version: Peer.MessageType<Version> = {
	command: "version",
	serialize(data) {
		const userAgentBytes = Buffer.from(data.userAgent, "utf8");
		const userAgentLength = Buffer.from([userAgentBytes.length]);

		const buffer = Buffer.alloc(150);
		let offset = 0;

		offset = buffer.writeInt32LE(data.version, offset);
		offset = buffer.writeBigUInt64LE(data.services, offset);
		offset = buffer.writeBigUInt64LE(data.timestamp, offset);
		offset = buffer.writeBigUInt64LE(data.recvServices, offset);
		offset = writeBuffer(buffer, zeroPad16, offset);
		offset = buffer.writeUInt16BE(data.recvPort, offset);
		offset = buffer.writeBigUInt64LE(data.transServices, offset);
		offset = writeBuffer(buffer, zeroPad16, offset);
		offset = buffer.writeUInt16BE(data.transPort, offset);
		offset = buffer.writeBigUInt64LE(data.nonce, offset);

		offset = writeBuffer(buffer, userAgentLength, offset);
		offset = writeBuffer(buffer, userAgentBytes, offset);

		offset = buffer.writeInt32LE(data.startHeight, offset);
		offset = buffer.writeUInt8(data.relay ? 1 : 0, offset);

		return buffer.subarray(0, offset);
	},
	deserialize(buffer: Buffer) {
		let offset = 0;

		const version = buffer.readInt32LE(offset);
		offset += 4;
		const services = buffer.readBigUInt64LE(offset);
		offset += 8;
		const timestamp = buffer.readBigUInt64LE(offset);
		offset += 8;
		const recvServices = buffer.readBigUInt64LE(offset);
		offset += 8;

		const recvIP = buffer.subarray(offset, offset + 16);
		offset += 16;
		const recvPort = buffer.readUInt16BE(offset);
		offset += 2;

		const transServices = buffer.readBigUInt64LE(offset);
		offset += 8;
		const transIP = buffer.subarray(offset, offset + 16);
		offset += 16;
		const transPort = buffer.readUInt16BE(offset);
		offset += 2;

		const nonce = buffer.readBigUInt64LE(offset);
		offset += 8;

		const userAgentLength = buffer[offset]!;
		offset += 1;
		const userAgentStr = buffer.subarray(offset, offset + userAgentLength).toString("utf8");
		offset += userAgentLength;

		const startHeight = buffer.readInt32LE(offset);
		offset += 4;

		const relay = !!buffer.readUInt8(offset);
		offset += 1;

		return {
			version,
			services,
			timestamp,
			recvServices,
			recvIP,
			recvPort,
			transServices,
			transIP,
			transPort,
			nonce,
			userAgent: userAgentStr,
			startHeight,
			relay,
		};
	},
};
