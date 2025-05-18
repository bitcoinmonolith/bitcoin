import { Message } from "~/Bitcoin.js";
import { Peer } from "~/Peers.js";
import { Headers } from "./Headers.js";

export type GetHeaders = {
	version: number;
	hashes: Buffer[]; // block locator hashes
	stopHash: Buffer;
};

export const GetHeaders: Peer.MessageType<GetHeaders> = {
	command: "getheaders",

	serialize(data) {
		const count = data.hashes.length;
		const header = Buffer.alloc(4 + 1 + 32 * count + 32);

		let offset = 0;

		offset = header.writeUInt32LE(data.version, offset);

		// CompactSize count (assuming < 0xfd)
		if (count >= 0xfd) {
			throw new Error("Too many block locator hashes; CompactSize > 0xfc not supported here.");
		}
		offset = header.writeUInt8(count, offset);

		for (const hash of data.hashes) {
			if (hash.length !== 32) throw new Error("Invalid hash length in locator");
			hash.copy(header, offset);
			offset += 32;
		}

		if (data.stopHash.length !== 32) {
			throw new Error("Invalid stopHash length");
		}
		data.stopHash.copy(header, offset);
		offset += 32;

		return header.subarray(0, offset);
	},

	deserialize(buffer) {
		let offset = 0;

		const version = buffer.readUInt32LE(offset);
		offset += 4;

		const count = buffer.readUInt8(offset++);
		const hashes: Buffer[] = [];

		for (let i = 0; i < count; i++) {
			hashes.push(buffer.subarray(offset, offset + 32));
			offset += 32;
		}

		const stopHash = buffer.subarray(offset, offset + 32);
		offset += 32;

		return { version, hashes, stopHash };
	},
};

export const GetHeadersHandler: Message<GetHeaders> = {
	type: GetHeaders,
	async handler({ peer, data, ctx }) {
		const { chain } = ctx;

		peer.log(`📚 Received getheaders (locator count: ${data.hashes.length})`);

		let known: string | undefined;

		// 1. Find first known hash
		for (const locator of data.hashes) {
			const hex = locator.toString("hex");
			if (chain.has(hex)) {
				known = hex;
				break;
			}
		}

		if (!known) {
			peer.logWarn("🤷 No common ancestor found for getheaders");
			return;
		}

		// 2. Walk forward from the known block
		const headers: Buffer[] = [];
		let next = chain.nextBlockHeader(known);

		while (next && headers.length < 2000) {
			headers.push(next.raw);
			if (next.hash === data.stopHash.toString("hex")) break;
			next = chain.nextBlockHeader(next.hash);
		}

		peer.log(`📦 Sending ${headers.length} headers`);
		await peer.send(Headers, { headers });
	},
};
