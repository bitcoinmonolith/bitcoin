import { Codec } from "@nomadshiba/struct-js";
import { BytesView } from "~/lib/BytesView.ts";
import { PeerMessage } from "~/lib/satoshi/p2p/PeerMessage.ts";

export type VersionMessage = {
	version: number;
	services: bigint;
	timestamp: bigint;
	recvServices: bigint;
	recvIP: Uint8Array;
	recvPort: number;
	transServices: bigint;
	transIP: Uint8Array;
	transPort: number;
	nonce: bigint;
	userAgent: string;
	startHeight: number;
	relay: boolean;
};

export class VersionMessageCodec extends Codec<VersionMessage> {
	public readonly stride = -1;

	public encode(data: VersionMessage): Uint8Array {
		const userAgentBytes = new TextEncoder().encode(data.userAgent);
		const userAgentLength = userAgentBytes.length;

		const bytes = new Uint8Array(150);
		const view = new BytesView(bytes);

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
	}

	public decode(bytes: Uint8Array): VersionMessage {
		const view = new BytesView(bytes);
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
	}
}

export const VersionMessage = new PeerMessage("version", new VersionMessageCodec());
