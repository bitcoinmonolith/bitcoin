import { bytesToNumberLE } from "@noble/curves/abstract/utils";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import { equals } from "@std/bytes";
import { join } from "@std/path";
import { Peer } from "~/lib/satoshi/p2p/Peer.ts";
import { Bitcoin } from "../../Bitcoin.ts";
import { CompactSize } from "../CompactSize.ts";
import { GENESIS_BLOCK_HASH, GENESIS_BLOCK_HEADER, GENESIS_BLOCK_PREV_HASH } from "../constants.ts";
import { JobPool } from "../JobPool.ts";
import { BlockHeader } from "../primitives/BlockHeader.ts";
import { GetHeadersMessage } from "../satoshi/p2p/messages/GetHeaders.ts";
import { HeadersMessage } from "../satoshi/p2p/messages/Headers.ts";
import { BlocksJobData, BlocksJobResult } from "./workers/verifyBlocks.ts";

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

export class Blockchain {
	public readonly baseDirectory: string;
	public readonly dataDirectory: string;
	public readonly workerCount: number;

	private readonly blockJobPool: JobPool<BlocksJobData, BlocksJobResult>;

	constructor(baseDirectory: string, workerCount = navigator.hardwareConcurrency || 4) {
		console.log(`Using ${workerCount} workers`);
		this.workerCount = workerCount;
		this.baseDirectory = baseDirectory;
		this.dataDirectory = join(baseDirectory, "data");

		const blockWorkerPath = import.meta.resolve("./workers/verifyBlocks.ts");
		this.blockJobPool = new JobPool<BlocksJobData, BlocksJobResult>(blockWorkerPath);
	}

	// prevHash(BigInt) -> height where that prev is found
	private prevHashToHeader = new Map<bigint, number>([[bytesToNumberLE(GENESIS_BLOCK_PREV_HASH), 0]]);

	// [hash, header, cumulativeWork]
	private headerChain: [Uint8Array, Uint8Array, bigint][] = [
		[GENESIS_BLOCK_HASH, GENESIS_BLOCK_HEADER, workFromHeader(GENESIS_BLOCK_HEADER)],
	];

	getHeight() {
		return this.headerChain.length - 1;
	}
	private getTipWork(): bigint {
		return this.headerChain.at(-1)![2];
	}

	async downloadHeaders(ctx: Bitcoin, peer: Peer) {
		// work on a local candidate; only commit if it beats current tip work
		const chain: [Uint8Array, Uint8Array, bigint][] = Array.from(this.headerChain);

		const buildLocatorHashes = (): Uint8Array[] => {
			const locators: Uint8Array[] = [];
			let step = 1;
			let index = chain.length - 1;
			while (index >= 0) {
				locators.push(chain[index]![0]);
				if (locators.length >= 10) step <<= 1;
				index -= step;
			}
			if (!equals(locators.at(-1)!, GENESIS_BLOCK_HASH)) locators.push(GENESIS_BLOCK_HASH);
			return locators;
		};

		let locators = buildLocatorHashes();

		const getBestHash = () => chain.at(-1)![0];
		const getHeight = () => chain.length - 1;
		const getBestHeader = () => chain.at(-1)![1];
		const getTipWork = () => chain.at(-1)![2];

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
				console.log("Reached peer tip");
				break;
			}

			const firstPrevHash = headers.subarray(
				countSize + BlockHeader.shape.version.stride,
				countSize + BlockHeader.shape.version.stride + BlockHeader.shape.prevHash.stride,
			);

			if (!equals(firstPrevHash, getBestHash())) {
				const connectsToHeight = this.prevHashToHeader.get(bytesToNumberLE(firstPrevHash));
				if (connectsToHeight === undefined) {
					// unknown fork point; restart from genesis locators but keep current candidate
					locators = [GENESIS_BLOCK_HASH];
					// shrink candidate to just genesis, we’ll rebuild from a known point
					chain.length = 1;
				} else {
					// rewind candidate to the fork point
					chain.length = connectsToHeight + 1;
					locators = buildLocatorHashes();
				}
			}

			for (let i = 0; i < count; i++) {
				const headerOffset = countSize + i * (BlockHeader.stride + 1);
				const header = headers.subarray(headerOffset, headerOffset + BlockHeader.stride);
				const prevHash = header.subarray(
					BlockHeader.shape.version.stride,
					BlockHeader.shape.version.stride + BlockHeader.shape.prevHash.stride,
				);
				if (!equals(prevHash, getBestHash())) {
					throw new Error(`Headers do not form a chain at index ${i}`);
				}

				const hash = sha256(sha256(header));
				if (!verifyProofOfWork(header, hash)) {
					throw new Error(`Invalid proof of work at height ${getHeight() + 1}`);
				}
				const cumul = getTipWork() + workFromHeader(header);
				chain.push([hash, header, cumul]);
			}

			const bestHash = getBestHash();
			locators = [bestHash];
			console.log(
				`Downloaded ${getHeight()} headers, latest: ${
					bytesToHex(getBestHash().toReversed())
				}, work=${getTipWork()}`,
			);
		}

		// commit only if cumulative work improved (true "longest" chain)
		if (getTipWork() > this.getTipWork()) {
			console.log(`Updating chain: height ${this.getHeight()} → ${chain.length - 1}`);
			this.headerChain = chain;

			this.prevHashToHeader.clear();
			this.prevHashToHeader.set(bytesToNumberLE(GENESIS_BLOCK_PREV_HASH), 0);
			for (const [height, [, header]] of this.headerChain.entries()) {
				const prevLE = header.subarray(
					BlockHeader.shape.version.stride,
					BlockHeader.shape.version.stride + BlockHeader.shape.prevHash.stride,
				);
				this.prevHashToHeader.set(bytesToNumberLE(prevLE), height);
			}
			console.log(`Chain updated. Height=${this.getHeight()} Work=${this.getTipWork()}`);
		} else {
			console.log(`Kept existing tip. Height=${this.getHeight()} Work=${this.getTipWork()}`);
		}

		console.log();
	}
}
