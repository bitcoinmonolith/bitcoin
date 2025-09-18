import { equals } from "@std/bytes";
import { join } from "@std/path";
import { Peer } from "~/lib/satoshi/p2p/Peer.ts";
import { Bitcoin } from "../../Bitcoin.ts";
import { CompactSize } from "../CompactSize.ts";
import { GENESIS_BLOCK_HASH } from "../constants.ts";
import { JobPool } from "../JobPool.ts";
import { BlockHeader } from "../primitives/BlockHeader.ts";
import { GetDataMessage } from "../satoshi/p2p/messages/GetData.ts";
import { GetHeadersMessage } from "../satoshi/p2p/messages/GetHeaders.ts";
import { HeadersMessage } from "../satoshi/p2p/messages/Headers.ts";
import { BlocksJobData, BlocksJobResult } from "./workers/verifyBlocks.ts";
import { HeadersJobData, HeadersJobResult } from "./workers/verifyHeaders.ts";
import { bytesToHex } from "@noble/hashes/utils";
import { BlockMessage } from "../satoshi/p2p/messages/Block.ts";

export class Blockchain {
	public readonly baseDirectory: string;
	public readonly dataDirectory: string;
	public readonly workerCount: number;

	private readonly headerJobPool: JobPool<HeadersJobData, HeadersJobResult>;
	private readonly blockJobPool: JobPool<BlocksJobData, BlocksJobResult>;

	constructor(baseDirectory: string, workerCount = navigator.hardwareConcurrency || 4) {
		console.log(`Using ${workerCount} workers`);
		this.workerCount = workerCount;
		this.bestHash = new Uint8Array(new SharedArrayBuffer(GENESIS_BLOCK_HASH.byteLength));
		this.bestHash.set(GENESIS_BLOCK_HASH);
		this.bestHeight = 0;
		this.baseDirectory = baseDirectory;
		this.dataDirectory = join(baseDirectory, "data");

		const blockWorkerPath = import.meta.resolve("./workers/verifyBlocks.ts");
		this.blockJobPool = new JobPool<BlocksJobData, BlocksJobResult>(blockWorkerPath);

		const headerWorkerPath = import.meta.resolve("./workers/verifyHeaders.ts");
		this.headerJobPool = new JobPool<HeadersJobData, HeadersJobResult>(headerWorkerPath, 1);
	}

	private blocksByPrevHash = new Map<string, Uint8Array>();

	lastSyncPerformance = 0;
	public bestHash: Uint8Array<SharedArrayBuffer>;
	public bestHeight: number = 0;
	async fetchHeaders(ctx: Bitcoin, peer: Peer): Promise<void> {
		console.log(`Fetching headers from peer ${peer.host}:${peer.port}...`);

		const headersPromise = peer.expectRaw(HeadersMessage);
		await peer.send(GetHeadersMessage, {
			version: ctx.version.version,
			locators: [this.bestHash],
			stopHash: new Uint8Array(32),
		});
		const headers = await headersPromise;
		const [count, countSize] = CompactSize.decode(headers, 0);
		if (count === 0) {
			console.log("Reached peer tip");
			return;
		}

		const firstPrevHash = headers.subarray(
			countSize + BlockHeader.shape.version.stride,
			countSize + BlockHeader.shape.version.stride + BlockHeader.shape.prevHash.stride,
		);
		if (!equals(firstPrevHash, this.bestHash)) {
			throw new Error("Headers do not connect to current chain");
		}

		await this.headerJobPool.queue({
			headersBuffer_ro: headers.buffer,
			lastHashBuffer_rw: this.bestHash.buffer,
		});

		console.log(`fetched ${count} headers`);

		if (count === 0) {
			console.log("caught up to peer tip");
			return;
		}

		const inventory: GetDataMessage["inventory"] = new Array(count);
		for (let i = 0; i < count; i++) {
			const headerOffset = countSize + i * (BlockHeader.stride + 1);
			const prevHash = headers.subarray(
				headerOffset + BlockHeader.shape.version.stride,
				headerOffset + BlockHeader.shape.version.stride + BlockHeader.shape.prevHash.stride,
			);
			this.blocksByPrevHash.set(
				bytesToHex(prevHash),
				headers.subarray(headerOffset, headerOffset + BlockHeader.stride),
			);
			inventory[i] = { type: "WITNESS_BLOCK", hash: prevHash }; // type 2 = block
			this.bestHeight++;
		}

		peer.listen((msg) => {
			if (msg.command !== BlockMessage.command) return;
			const blockPrevHash = msg.payload.subarray(
				BlockHeader.shape.version.stride,
				BlockHeader.shape.version.stride + BlockHeader.shape.prevHash.stride,
			);
			const blockPrevHashHex = bytesToHex(blockPrevHash);
			const header = this.blocksByPrevHash.get(blockPrevHashHex);
			if (!header) {
				console.warn("Received block not requested, ignoring");
				return;
			}

			if (header.byteLength !== BlockHeader.stride) {
				console.warn("cache is not a header, ignoring");
				return;
			}

			const headerMatch = equals(
				header,
				msg.payload.subarray(0, BlockHeader.stride),
			);

			if (!headerMatch) {
				console.warn("Received block does not match header, ignoring");
				return;
			}

			this.blocksByPrevHash.set(blockPrevHashHex, msg.payload);
			console.log(`Received block ${bytesToHex(blockPrevHash.toReversed())}`);
		});

		await peer.send(GetDataMessage, { inventory });
	}
}
