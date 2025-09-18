import { Struct, u8 } from "@nomadshiba/struct-js";
import { equals } from "@std/bytes";
import { join } from "@std/path";
import { bytes32 } from "~/lib/primitives/Bytes32.ts";
import { Peer } from "~/lib/satoshi/p2p/Peer.ts";
import { Store } from "~/lib/Store.ts";
import { Bitcoin } from "../../Bitcoin.ts";
import { GENESIS_BLOCK_HASH } from "../constants.ts";
import { getBlockHash } from "../primitives/BlockHeader.ts";
import { BlockMessage } from "../satoshi/p2p/messages/Block.ts";
import { GetDataMessage } from "../satoshi/p2p/messages/GetData.ts";
import { GetHeadersMessage } from "../satoshi/p2p/messages/GetHeaders.ts";
import { HeadersMessage } from "../satoshi/p2p/messages/Headers.ts";
import { saveBlock } from "./blocks.ts";

export class Blockchain {
	public readonly baseDirectory: string;
	public readonly dataDirectory: string;

	public bestHash: Uint8Array;
	public bestHeight: number = 0;
	public headers: SharedArrayBuffer[] = [];

	public readonly info: Store<[number], {
		bestHash: Uint8Array;
		bestHeight: number;
	}>;

	constructor(baseDirectory: string, bestHash: Uint8Array, bestHeight: number) {
		this.bestHash = bestHash;
		this.bestHeight = bestHeight;
		this.baseDirectory = baseDirectory;
		this.dataDirectory = join(baseDirectory, "data");
		this.info = new Store([u8], new Struct({ bestHash: bytes32, bestHeight: u8 }), {
			base: this.baseDirectory,
			name: "info",
		});
	}

	lastSyncPerformance = 0;

	async fetchHeaders(ctx: Bitcoin, peer: Peer): Promise<void> {
		await peer.send(GetHeadersMessage, {
			version: ctx.version.version,
			locators: [this.bestHash],
			stopHash: new Uint8Array(32),
		});

		const headersMsg = await peer.expect(
			HeadersMessage,
			(msg) =>
				msg.headers.length === 0 || Boolean(msg.headers[0] && equals(msg.headers[0]?.prevHash, this.bestHash)),
		);
		const headers = headersMsg.headers;
		if (headers.length === 0) {
			console.log("caught up to peer tip");
			return;
		}
		if (this.bestHash === GENESIS_BLOCK_HASH) {
			await peer.send(GetDataMessage, {
				inventory: [{ type: "WITNESS_BLOCK", hash: GENESIS_BLOCK_HASH }],
			});
			const block = await peer.expect(BlockMessage, (b) => equals(getBlockHash(b.header), GENESIS_BLOCK_HASH));
			await saveBlock(0, block);
		}

		let prevHash = this.bestHash;
		for (const header of headers) {
			if (!equals(header.prevHash, prevHash)) {
				throw new Error("chain broken");
			}

			if (this.bestHeight % 100 === 0) {
				const time = performance.now() - this.lastSyncPerformance;
				this.lastSyncPerformance = performance.now();
				const blocksPerSecond = 100 / (time / 1000);
				console.log(`syncing... height=${this.bestHeight} (${blocksPerSecond.toFixed(2)} blocks/s)`);
			}

			const hash = getBlockHash(header);
			const height = ++this.bestHeight;
			prevHash = hash;
			this.bestHash = hash;

			await peer.send(GetDataMessage, {
				inventory: [{ type: "WITNESS_BLOCK", hash }],
			});

			const block = await peer.expect(BlockMessage, (b) => equals(getBlockHash(b.header), hash));

			/* const computedMerkle = computeSatoshiMerkleRoot(block.txs.map(getTxId));
			if (!equals(computedMerkle, block.header.merkleRoot)) {
				throw new Error("invalid merkle root");
			} */

			await saveBlock(height, block);
		}

		return this.fetchHeaders(ctx, peer);
	}
}
