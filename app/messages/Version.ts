import { Peer } from "../Peer.ts";
import { BytesView } from "../BytesView.ts";

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

export const Version: Peer.Message<Version> = {
	command: "version",
	serialize(data) {
		const userAgentBytes = new TextEncoder().encode(data.userAgent);
		const userAgentLength = userAgentBytes.length;

		const bytes = new Uint8Array(150);
		const view = BytesView(bytes);

		let offset = 0;

		view.setInt32(offset, data.version, true);
		offset += 4;

		view.setBigUint64(offset, data.services, true);
		offset += 8;

		view.setBigUint64(offset, data.timestamp, true);
		offset += 8;

		view.setBigUint64(offset, data.recvServices, true);
		offset += 8;

		offset += 16; // skip recvIP

		view.setUint16(offset, data.recvPort, false);
		offset += 2;

		view.setBigUint64(offset, data.transServices, true);
		offset += 8;

		offset += 16; // skip transIP

		view.setUint16(offset, data.transPort, false);
		offset += 2;

		view.setBigUint64(offset, data.nonce, true);
		offset += 8;

		bytes[offset++] = userAgentLength;
		bytes.set(userAgentBytes, offset);
		offset += userAgentLength;

		view.setInt32(offset, data.startHeight, true);
		offset += 4;

		bytes[offset++] = data.relay ? 1 : 0;

		return bytes.subarray(0, offset);
	},

	deserialize(bytes) {
		const view = BytesView(bytes);
		let offset = 0;

		const version = view.getInt32(offset, true);
		offset += 4;

		const services = view.getBigUint64(offset, true);
		offset += 8;

		const timestamp = view.getBigUint64(offset, true);
		offset += 8;

		const recvServices = view.getBigUint64(offset, true);
		offset += 8;

		const recvIP = bytes.subarray(offset, offset + 16);
		offset += 16;

		const recvPort = view.getUint16(offset, false);
		offset += 2;

		const transServices = view.getBigUint64(offset, true);
		offset += 8;

		const transIP = bytes.subarray(offset, offset + 16);
		offset += 16;

		const transPort = view.getUint16(offset, false);
		offset += 2;

		const nonce = view.getBigUint64(offset, true);
		offset += 8;

		const userAgentLength = bytes[offset++]!;
		const userAgent = new TextDecoder().decode(bytes.subarray(offset, offset + userAgentLength));
		offset += userAgentLength;

		const startHeight = view.getInt32(offset, true);
		offset += 4;

		const relay = !!bytes[offset++];

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
			userAgent,
			startHeight,
			relay,
		};
	},
};
