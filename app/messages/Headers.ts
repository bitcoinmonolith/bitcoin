import { Codec } from "@nomadshiba/struct-js";
import { BlockHeader } from "~/lib/primitives/BlockHeader.ts";
import { PeerMessage } from "~/lib/p2p/PeerMessage.ts";

export type HeadersMessage = {
	headers: BlockHeader[]; // each header is 80 bytes
};

export class HeadersMessageCodec extends Codec<HeadersMessage> {
	public readonly stride = -1;

	public encode(data: HeadersMessage): Uint8Array {
		const count = data.headers.length;
		if (count >= 0xfd) throw new Error("Too many headers");

		const bytes = new Uint8Array(1 + count * (80 + 1)); // 1 varint + 81 per header (80 + tx count)
		let offset = 0;

		bytes[offset++] = count;

		for (const header of data.headers) {
			const headerBytes = BlockHeader.encode(header);
			if (headerBytes.byteLength !== 80) throw new Error("Invalid header size");
			bytes.set(headerBytes, offset);
			offset += 80;

			// tx count — always 0x00
			bytes[offset++] = 0x00;
		}

		return bytes;
	}

	public decode(bytes: Uint8Array): HeadersMessage {
		let offset = 0;
		const count = bytes[offset++]!;
		const headers: BlockHeader[] = [];

		for (let i = 0; i < count; i++) {
			const headerBytes = bytes.subarray(offset, offset + 80);
			if (headerBytes.byteLength !== 80) throw new Error("Incomplete header data");
			offset += 80;

			const txCount = bytes[offset++];
			if (txCount !== 0x00) throw new Error("Invalid tx count in headers message");

			headers.push(BlockHeader.decode(headerBytes));
		}

		return { headers };
	}
}

export const HeadersMessage = new PeerMessage("headers", new HeadersMessageCodec());
