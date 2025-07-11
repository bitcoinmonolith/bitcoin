import { Peer } from "~/Peers.ts";
import { readInt32LE, readUInt16BE, readUInt64LE, readUInt8, writeBytes, writeInt32LE, writeUInt16BE, writeUInt64LE, writeUInt8 } from "~/utils.ts";

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
		const userAgentBytes = new TextEncoder().encode(data.userAgent);
		const userAgentLength = new Uint8Array([userAgentBytes.length]);

		const buffer = new Uint8Array(150);
		let offset = 0;

		offset = writeInt32LE(buffer, data.version, offset);
		offset = writeUInt64LE(buffer, data.services, offset);
		offset = writeUInt64LE(buffer, data.timestamp, offset);
		offset = writeUInt64LE(buffer, data.recvServices, offset);
		offset += 16; // skip
		offset = writeUInt16BE(buffer, data.recvPort, offset);
		offset = writeUInt64LE(buffer, data.transServices, offset);
		offset += 16; // skip
		offset = writeUInt16BE(buffer, data.transPort, offset);
		offset = writeUInt64LE(buffer, data.nonce, offset);

		offset = writeBytes(buffer, userAgentLength, offset);
		offset = writeBytes(buffer, userAgentBytes, offset);

		offset = writeInt32LE(buffer, data.startHeight, offset);
		offset = writeUInt8(buffer, data.relay ? 1 : 0, offset);

		return buffer.subarray(0, offset);
	},
	deserialize(buffer: Uint8Array) {
		let offset = 0;

		const version = readInt32LE(buffer, offset);
		offset += 4;
		const services = readUInt64LE(buffer, offset);
		offset += 8;
		const timestamp = readUInt64LE(buffer, offset);
		offset += 8;
		const recvServices = readUInt64LE(buffer, offset);
		offset += 8;

		const recvIP = buffer.subarray(offset, offset + 16);
		offset += 16;
		const recvPort = readUInt16BE(buffer, offset);
		offset += 2;

		const transServices = readUInt64LE(buffer, offset);
		offset += 8;
		const transIP = buffer.subarray(offset, offset + 16);
		offset += 16;
		const transPort = readUInt16BE(buffer, offset);
		offset += 2;

		const nonce = readUInt64LE(buffer, offset);
		offset += 8;

		const userAgentLength = buffer[offset]!;
		offset += 1;
		const userAgentStr = new TextDecoder().decode(buffer.subarray(offset, offset + userAgentLength));
		offset += userAgentLength;

		const startHeight = readInt32LE(buffer, offset);
		offset += 4;

		const relay = !!readUInt8(buffer, offset);
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
