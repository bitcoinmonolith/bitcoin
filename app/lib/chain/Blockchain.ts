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
import { BlocksJobData, BlocksJobResult } from "./workers/blocks.parallel.ts";

export class Blockchain {
	public readonly baseDirectory: string;
	public readonly workerCount: number;

	private readonly blockJobPool: JobPool<BlocksJobData, BlocksJobResult>;

	private localChain: Chain;
	private readonly chainStore: ChainStore;
	private readonly hashToHeight: Map<bigint, number>;
	private readonly prevHashToHeight: Map<bigint, number>;
	private readonly bannedBlockHashes = new Set<bigint>();

	private readonly chainLock: LockManager;

	private readonly blockPoolCap = 1000;
	private readonly blockPool: Uint8Array<SharedArrayBuffer>[] = [];

	constructor(baseDirectory: string, workerCount = navigator.hardwareConcurrency || 4) {
		console.log(`Using ${workerCount} workers`);
		this.workerCount = workerCount;
		this.baseDirectory = baseDirectory;

		const blockWorkerPath = import.meta.resolve("./workers/blocks.parallel.ts");
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
		this.processBlockPool();
		await this.downloadBlocks(peer);
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

		syncToPeerTip: while (true) {
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
					throw new Error("Chain split twice from same peer, aborting. Peer's own chain changed?");
				}
				chainSplit = { commonHeight: this.hashToHeight.get(bytesToNumberLE(firstPrevHash)) ?? 0 };

				peerChain.truncate(chainSplit.commonHeight);
				peer.log(`Rewound to height ${chainSplit.commonHeight} to resolve a fork`);
			}

			for (let i = 0; i < count; i++) {
				const headerOffset = countSize + i * (BlockHeader.stride + 1);
				const header = headers.subarray(headerOffset, headerOffset + BlockHeader.stride);
				const height = peerChain.getHeight() + 1;
				const prevHash = header.subarray(
					BlockHeader.shape.version.stride,
					BlockHeader.shape.version.stride + BlockHeader.shape.prevHash.stride,
				);
				if (!equals(prevHash, peerChain.getTip().hash)) {
					peer.logWarn(humanize(prevHash), humanize(peerChain.getTip().hash));
					peer.logWarn(`Headers do not form a chain at height ${height}`);
					// act as if we reached the tip, accept the partial chain in case cumulative work is higher than our local anyway
					break syncToPeerTip;
				}

				const hash = sha256(sha256(header));
				if (this.bannedBlockHashes.has(bytesToNumberLE(hash))) {
					peer.logWarn(`Peer sent a banned block at height ${height}`);
					break syncToPeerTip;
				}
				if (!verifyProofOfWork(header, hash)) {
					peer.logWarn(`Invalid proof of work at height ${height}`);
					break syncToPeerTip;
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

		console.log();
	}

	private blockHeight = 900_000;
	private async downloadBlocks(peer: Peer): Promise<void> {
		// download blocks until blockHeight is up to date with localChain height
		// fetch in bulk, and put them in blockPool but if blockPool is full, wait until it has space
		const bulkCount = 10; // how many blocks to request at once
		while (this.blockHeight <= this.localChain.getHeight()) {
			if (this.blockPool.length >= this.blockPoolCap) {
				console.log(`Block pool full (${this.blockPool.length}/${this.blockPoolCap}), waiting...`);
				await delay(100); // wait until blockPool has space
				continue;
			}

			const length = Math.min(bulkCount, this.localChain.getHeight() - this.blockHeight + 1);
			const getDataMessage: GetDataMessage = { inventory: new Array(length) };
			for (let i = 0; i < length; i++) {
				const { hash } = this.localChain.at(this.blockHeight + i)!;
				getDataMessage.inventory[i] = { type: "WITNESS_BLOCK", hash };
			}

			let i = 0;
			const unlisted = peer.listen((msg) => {
				if (msg.command !== BlockMessage.command) return;
				const buffer = new Uint8Array(new SharedArrayBuffer(msg.payload.length));
				buffer.set(msg.payload);
				this.blockPool.push(buffer);
				this.blockHeight++;
				if (++i === length) {
					unlisted();
					return;
				}
			});
			await peer.send(GetDataMessage, getDataMessage);
			while (i < length) await delay(0);
		}
	}

	// TODO: General idea is something like this... but i think i should also instead of slicing from the pool, i should have multiple pools and cycle through them.
	// This way i wont allocate and copy stuff and also have less fragmentation. idk
	private async processBlockPool(): Promise<void> {
		let total = this.blockHeight;
		while (true) {
			if (this.blockPool.length === 0) {
				await delay(100);
				continue;
			}
			const processCount = Math.min(100, this.blockPool.length);
			const processCountPerWorker = processCount > this.workerCount
				? Math.ceil(processCount / this.workerCount)
				: processCount;
			const jobs: Promise<void>[] = [];
			for (let i = 0; i < this.workerCount; i++) {
				const processCountPerWorkerFixed = Math.min(processCountPerWorker, this.blockPool.length);
				if (processCountPerWorkerFixed === 0) break;
				const blocks = this.blockPool.slice(-processCountPerWorkerFixed);
				this.blockPool.length -= processCountPerWorkerFixed;

				const start = performance.now();
				jobs.push(
					this.blockJobPool.queue({ blockBuffers: blocks }).then(({ data, workerIndex }) => {
						if (!data.valid) {
							console.error("Block verification failed:", data.error);
							throw new Error("Block verification failed");
						}
						const duration = performance.now() - start;
						total += blocks.length;
						console.log(
							`[Worker ${workerIndex}]\tVerified ${blocks.length} blocks\tin ${
								duration.toFixed(2)
							}ms, avg ${(duration / blocks.length).toFixed(2)}ms/block, total blocks ${total}`,
						);
					}),
				);
			}
			await Promise.all(jobs);
		}
	}
}
