import { bytesToNumberLE } from "@noble/curves/abstract/utils";
import { sha256 } from "@noble/hashes/sha2";
import { delay } from "@std/async";
import { equals } from "@std/bytes";
import { join } from "@std/path";
import { Peer } from "~/lib/satoshi/p2p/Peer.ts";
import { Bitcoin } from "../../Bitcoin.ts";
import { CompactSize } from "../CompactSize.ts";
import { GENESIS_BLOCK_HASH } from "../constants.ts";
import { JobPool } from "../JobPool.ts";
import { LockManager } from "../LockManager.ts";
import { humanize } from "../logging/human.ts";
import { BlockHeader } from "../primitives/BlockHeader.ts";
import { BlockMessage } from "../satoshi/p2p/messages/Block.ts";
import { GetDataMessage } from "../satoshi/p2p/messages/GetData.ts";
import { GetHeadersMessage } from "../satoshi/p2p/messages/GetHeaders.ts";
import { HeadersMessage } from "../satoshi/p2p/messages/Headers.ts";
import { Chain } from "./Chain.ts";
import { ChainStore } from "./ChainStore.ts";
import { verifyProofOfWork, workFromHeader } from "./utils.ts";
import { BlocksJobData, BlocksJobResult } from "./workers/verifyBlocks.ts";

export class Blockchain {
	public readonly baseDirectory: string;
	public readonly workerCount: number;

	private readonly blockJobPool: JobPool<BlocksJobData, BlocksJobResult>;

	private localChain: Chain;
	private chainStore: ChainStore;
	private hashToHeight: Map<bigint, number>;
	private prevHashToHeight: Map<bigint, number>;

	private chainLock: LockManager;

	constructor(baseDirectory: string, workerCount = navigator.hardwareConcurrency || 4) {
		console.log(`Using ${workerCount} workers`);
		this.workerCount = workerCount;
		this.baseDirectory = baseDirectory;

		const blockWorkerPath = import.meta.resolve("./workers/verifyBlocks.ts");
		this.blockJobPool = new JobPool<BlocksJobData, BlocksJobResult>(blockWorkerPath);

		this.chainLock = new LockManager(); // Probably wont need this, because i think about doing stuff in async ticks.

		this.localChain = new Chain([]);
		this.chainStore = new ChainStore(join(this.baseDirectory, "headers.dat"));
		this.hashToHeight = new Map();
		this.prevHashToHeight = new Map();
		this.chainStore.load(this.localChain);
		this.reindexChain();
	}

	public async letsTestThis(ctx: Bitcoin, peer: Peer): Promise<void> {
		await this.downloadChain(ctx, peer);
		await this.downloadChain(ctx, peer); // second time to test chain reorg handling
		await this.downloadBlocks(ctx, peer);
	}

	private reindexChain(): void {
		this.prevHashToHeight.clear();
		this.hashToHeight.clear();
		for (const [height, { header, hash }] of this.localChain.entries()) {
			const prevHash = header.subarray(
				BlockHeader.shape.version.stride,
				BlockHeader.shape.version.stride + BlockHeader.shape.prevHash.stride,
			);
			this.prevHashToHeight.set(bytesToNumberLE(prevHash), height);
			this.hashToHeight.set(bytesToNumberLE(hash), height);
		}
	}

	private async downloadChain(ctx: Bitcoin, peer: Peer): Promise<void> {
		const peerChain = new Chain(Array.from(this.localChain));
		let chainSplit: { commonHeight: number } | null = null;

		const locators: Uint8Array[] = [];
		let step = 1;
		let index = peerChain.getHeight();
		while (index >= 0) {
			locators.push(peerChain.at(index)!.hash);
			if (locators.length >= 10) step <<= 1;
			index -= step;
		}
		if (!equals(locators.at(-1)!, GENESIS_BLOCK_HASH)) {
			locators.push(GENESIS_BLOCK_HASH);
		}

		while (true) {
			const headersPromise = peer.expectRaw(HeadersMessage);
			await peer.send(GetHeadersMessage, {
				version: ctx.version.version,
				locators,
				stopHash: new Uint8Array(32),
			});
			const headers = await headersPromise;
			const [count, countSize] = CompactSize.decode(headers, 0);
			if (count === 0) {
				peer.log("Reached peer tip");
				break;
			}

			const firstPrevHash = headers.subarray(
				countSize + BlockHeader.shape.version.stride,
				countSize + BlockHeader.shape.version.stride + BlockHeader.shape.prevHash.stride,
			);

			if (!equals(firstPrevHash, peerChain.getTip().hash)) {
				if (chainSplit) {
					throw new Error("Chain split twice from same peer, aborting");
				}
				chainSplit = { commonHeight: this.hashToHeight.get(bytesToNumberLE(firstPrevHash)) ?? 0 };

				peerChain.truncate(chainSplit.commonHeight);
				peer.log(`Rewound to height ${chainSplit.commonHeight} to resolve a fork`);
			}

			for (let i = 0; i < count; i++) {
				const headerOffset = countSize + i * (BlockHeader.stride + 1);
				const header = headers.subarray(headerOffset, headerOffset + BlockHeader.stride);
				const prevHash = header.subarray(
					BlockHeader.shape.version.stride,
					BlockHeader.shape.version.stride + BlockHeader.shape.prevHash.stride,
				);
				if (!equals(prevHash, peerChain.getTip().hash)) {
					console.log(humanize(prevHash), humanize(peerChain.getTip().hash));
					throw new Error(`Headers do not form a chain at height ${peerChain.getHeight() + 1}`);
				}

				const hash = sha256(sha256(header));
				if (!verifyProofOfWork(header, hash)) {
					throw new Error(`Invalid proof of work at height ${peerChain.getHeight() + 1}`);
				}
				const cumulativeWork = peerChain.getTip().cumulativeWork + workFromHeader(header);
				peerChain.append({ hash, header, cumulativeWork });
			}

			locators[0] = peerChain.getTip().hash;
			locators.length = 1;
			peer.log(
				`Downloaded ${peerChain.getHeight()} headers, latest: ${
					humanize(peerChain.getTip().hash)
				}, work=${peerChain.getTip().cumulativeWork}`,
			);
		}

		// commit only if cumulative work improved (true "longest" chain)
		if (peerChain.getTip().cumulativeWork > this.localChain.getTip().cumulativeWork) {
			peer.log(`Updating chain: height ${this.localChain.getHeight()} → ${peerChain.length - 1}`);
			if (chainSplit) {
				await this.chainStore.truncate(chainSplit.commonHeight);
				const commonLength = chainSplit.commonHeight + 1;
				await this.chainStore.appendHeaders(peerChain.values().drop(commonLength));
			} else {
				await this.chainStore.appendHeaders(peerChain.values().drop(this.localChain.length));
			}

			this.localChain = peerChain;
			this.reindexChain();
			peer.log(
				`Chain updated. Height=${this.localChain.getHeight()} Work=${this.localChain.getTip().cumulativeWork}`,
			);
		} else {
			peer.log(
				`Kept existing tip. Height=${this.localChain.getHeight()} Work=${this.localChain.getTip().cumulativeWork}`,
			);
		}

		peer.log();
	}

	// TODO: big single function for now, trying to understand the flow
	// This function is just for testing, dont worry about it.
	private async downloadBlocks(_ctx: Bitcoin, peer: Peer): Promise<void> {
		const bulkCount = 10; // how many blocks to request at once
		let totalSize = 0;

		const blocks: Uint8Array[] = [];
		for (let height = 0; height <= this.localChain.getHeight(); height += bulkCount) {
			const start = performance.now();
			const length = Math.min(bulkCount, this.localChain.getHeight() - height + 1);
			const getDataMessage: GetDataMessage = { inventory: new Array(length) };
			for (let i = 0; i < length; i++) {
				const { hash } = this.localChain.at(height + i)!;
				getDataMessage.inventory[i] = { type: "WITNESS_BLOCK", hash }; // type 2 = block
			}
			blocks.length = 0;
			const unlisted = peer.listen((msg) => {
				if (msg.command !== BlockMessage.command) return;
				blocks.push(msg.payload);
				if (blocks.length === length) {
					return unlisted();
				}
			});
			await peer.send(GetDataMessage, getDataMessage);
			while (blocks.length < length) {
				await delay(0);
			}
			if (blocks.length === 0) {
				peer.log("No blocks received, something is wrong");
				break;
			}
			if (blocks.length !== length) {
				peer.log(`Expected ${length} blocks, but got ${blocks.length}, something is wrong`);
				break;
			}

			const bulkSize = blocks.reduce((sum, b) => sum + b.byteLength, 0);
			totalSize += bulkSize;
			console.log(
				"Received",
				blocks.length,
				"blocks, verifying...",
				"height:",
				height,
				"size:",
				(bulkSize / 1024 / 1024).toFixed(2),
				"MB",
				"avarage:",
				(bulkSize / blocks.length / 1024 / 1024).toFixed(2),
				"MB",
				"total:",
				(totalSize / 1024 / 1024 / 1024).toFixed(2),
				"GB",
				"speed:",
				(length / ((performance.now() - start) / 1000)).toFixed(2),
				"blocks/s",
				"and",
				(bulkSize / ((performance.now() - start) / 1000) / 1024 / 1024).toFixed(2),
				"MB/s",
			);
		}
	}
}
