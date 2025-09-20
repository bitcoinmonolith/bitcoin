import { bytesToNumberLE } from "@noble/curves/abstract/utils";
import { sha256 } from "@noble/hashes/sha2";
import { equals } from "@std/bytes";
import { existsSync } from "@std/fs";
import { dirname, join } from "@std/path";
import { Peer } from "~/lib/satoshi/p2p/Peer.ts";
import { Bitcoin } from "../../Bitcoin.ts";
import { CompactSize } from "../CompactSize.ts";
import { GENESIS_BLOCK_HASH, GENESIS_BLOCK_HEADER } from "../constants.ts";
import { JobPool } from "../JobPool.ts";
import { humanize } from "../logging/human.ts";
import { BlockHeader } from "../primitives/BlockHeader.ts";
import { GetHeadersMessage } from "../satoshi/p2p/messages/GetHeaders.ts";
import { HeadersMessage } from "../satoshi/p2p/messages/Headers.ts";
import { BlocksJobData, BlocksJobResult } from "./workers/verifyBlocks.ts";
import { GetDataMessage } from "../satoshi/p2p/messages/GetData.ts";
import { BlockMessage } from "../satoshi/p2p/messages/Block.ts";
import { delay } from "@std/async";

const TWO256 = 1n << 256n;

function decodeNBitsFromHeader(header: Uint8Array): number {
	const nBitsOffset = BlockHeader.shape.version.stride +
		BlockHeader.shape.prevHash.stride +
		BlockHeader.shape.merkleRoot.stride +
		BlockHeader.shape.timestamp.stride;
	return (
		header[nBitsOffset]! |
		(header[nBitsOffset + 1]! << 8) |
		(header[nBitsOffset + 2]! << 16) |
		(header[nBitsOffset + 3]! << 24)
	) >>> 0;
}
function nBitsToTarget(nBits: number): bigint {
	const exponent = nBits >>> 24;
	const mantissa = nBits & 0x007fffff;
	return BigInt(mantissa) * (1n << (8n * (BigInt(exponent) - 3n)));
}
function workFromHeader(header: Uint8Array): bigint {
	const target = nBitsToTarget(decodeNBitsFromHeader(header));
	return target > 0n ? (TWO256 / (target + 1n)) : 0n;
}

function verifyProofOfWork(header: Uint8Array, hash: Uint8Array): boolean {
	const nBits = decodeNBitsFromHeader(header);
	const target = nBitsToTarget(nBits);
	const hashInt = bytesToNumberLE(hash); // use LE since Bitcoin compares hashes as little-endian numbers
	return hashInt <= target;
}

type ChainNode = Readonly<{
	hash: Uint8Array;
	header: Uint8Array;
	cumulativeWork: bigint;
}>;

interface Unlocker extends Disposable {
	unlock(): void;
}
class LockManager {
	private current: Promise<void> = Promise.resolve();

	async lock(): Promise<Unlocker> {
		const { promise, resolve } = Promise.withResolvers<void>();
		const unlocker: Unlocker = { [Symbol.dispose]: resolve, unlock: resolve };
		const prev = this.current;
		this.current = prev.then(() => promise);
		await prev;
		return unlocker;
	}
}

class Chain implements Iterable<ChainNode> {
	private chain: ChainNode[];

	constructor(use: ChainNode[]) {
		this.chain = use;
	}

	[Symbol.iterator](): ArrayIterator<Readonly<ChainNode>> {
		return this.chain.values();
	}

	public entries(): ArrayIterator<[number, Readonly<ChainNode>]> {
		return this.chain.entries();
	}

	public values(): ArrayIterator<Readonly<ChainNode>> {
		return this.chain.values();
	}

	public getHeight(): number {
		return this.chain.length - 1;
	}

	public getTip(): ChainNode {
		return this.chain.at(-1)!;
	}

	public truncate(height: number): void {
		this.chain.length = height + 1;
	}

	public clear(): void {
		this.chain.length = 0;
	}

	public append(...headers: ChainNode[]): void {
		this.chain.push(...headers);
	}

	public at(height: number): ChainNode | undefined {
		return this.chain.at(height);
	}

	public get length(): number {
		return this.chain.length;
	}
}

class ChainStore {
	public readonly path: string;
	constructor(path: string) {
		this.path = path;
	}

	public async appendHeaders(headers: ArrayIterator<ChainNode>): Promise<void> {
		await Deno.mkdir(dirname(this.path), { recursive: true });
		console.log(`Saving headers to ${this.path}`);
		const file = await Deno.open(this.path, { append: true, create: true });
		const writer = file.writable.getWriter();
		for (const { header } of headers) {
			await writer.write(header);
		}
		file.close();
		console.log("Headers saved");
	}

	public async truncate(height: number): Promise<void> {
		const size = (height + 1) * BlockHeader.stride;
		const path = join(this.path);
		const file = await Deno.open(path, { read: true, write: true });
		await file.truncate(size);
		file.close();
		[].entries;
	}

	public load(chain: Chain): void {
		const path = this.path;
		const size = existsSync(path) ? Deno.statSync(path).size : 0;
		if (size % BlockHeader.stride !== 0) {
			throw new Error("Invalid headers.dat file, size is not a multiple of header size");
		}

		chain.clear();
		chain.append({
			hash: GENESIS_BLOCK_HASH,
			header: GENESIS_BLOCK_HEADER,
			cumulativeWork: workFromHeader(GENESIS_BLOCK_HEADER),
		});

		if (size > 0) {
			Deno.mkdirSync(dirname(path), { recursive: true });
			const file = Deno.openSync(path, { read: true });
			const headerCount = size / BlockHeader.stride;
			console.log(`Loading ${headerCount} headers from ${path}`);

			for (let i = 0; i < headerCount; i++) {
				const header = new Uint8Array(BlockHeader.stride);
				const bytesRead = file.readSync(header);
				if (bytesRead !== BlockHeader.stride) {
					throw new Error("Failed to read full header from headers.dat");
				}
				const prevHash = header.subarray(
					BlockHeader.shape.version.stride,
					BlockHeader.shape.version.stride + BlockHeader.shape.prevHash.stride,
				);
				if (!equals(prevHash, chain.getTip().hash)) {
					throw new Error(`Headers do not form a chain at height ${i}`);
				}
				const hash = sha256(sha256(header));
				if (!verifyProofOfWork(header, hash)) {
					throw new Error(`Invalid proof of work at height ${i}`);
				}
				const cumulativeWork = chain.getTip().cumulativeWork + workFromHeader(header);
				chain.append({ hash, header, cumulativeWork });
			}
			file.close();
			console.log(
				`Loaded ${headerCount} headers. Height=${chain.getHeight()} Work=${chain.getTip().cumulativeWork}`,
			);
		}
	}
}

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
	private async downloadBlocks(ctx: Bitcoin, peer: Peer): Promise<void> {
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
