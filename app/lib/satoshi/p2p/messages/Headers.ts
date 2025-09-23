import { Codec } from "@nomadshiba/codec";
import { BlockHeader } from "~/lib/satoshi/primitives/BlockHeader.ts";
import { PeerMessage } from "~/lib/satoshi/p2p/PeerMessage.ts";
import { CompactSize } from "~/lib/CompactSize.ts";

export type HeadersMessage = {
	headers: BlockHeader[];
};

export class HeadersMessageCodec extends Codec<HeadersMessage> {
	public readonly stride = -1;

	public encode(data: HeadersMessage): Uint8Array {
		const count = data.headers.length;
		if (count > 2000) {
			throw new Error("Too many headers (max 2000)");
		}

		const chunks: Uint8Array[] = [];
		chunks.push(CompactSize.encode(count));

		for (const header of data.headers) {
			const headerBytes = BlockHeader.encode(header);
			if (headerBytes.byteLength !== 80) {
				throw new Error("Invalid header size");
			}
			chunks.push(headerBytes);

			// tx count — always 0x00 in headers message
			chunks.push(new Uint8Array([0x00]));
		}

		// flatten chunks into a single buffer
		const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
		const out = new Uint8Array(totalLength);
		let offset = 0;
		for (const c of chunks) {
			out.set(c, offset);
			offset += c.length;
		}
		return out;
	}

	public decode(bytes: Uint8Array): HeadersMessage {
		let offset = 0;

		const [count, bytesRead] = CompactSize.decode(bytes, offset);
		offset += bytesRead;
		if (count > 2000) {
			throw new Error("Too many headers (max 2000)");
		}

		const headers: BlockHeader[] = [];
		for (let i = 0; i < count; i++) {
			if (offset + BlockHeader.stride > bytes.length) {
				throw new Error("Incomplete header data");
			}
			const headerBytes = bytes.subarray(offset, offset + BlockHeader.stride);
			offset += BlockHeader.stride;

			const txCount = bytes[offset++];
			if (txCount !== 0x00) {
				throw new Error("Invalid tx count in headers message");
			}

			headers.push(BlockHeader.decode(headerBytes));
		}

		return { headers };
	}
}

export const HeadersMessage = new PeerMessage("headers", new HeadersMessageCodec());
