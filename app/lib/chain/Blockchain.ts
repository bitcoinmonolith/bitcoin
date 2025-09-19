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

type BlockHeaderNode = {
	hash: Uint8Array;
	header: Uint8Array;
	cumulativeWork: bigint;
};

export class Blockchain {
	public readonly baseDirectory: string;
	public readonly workerCount: number;

	private readonly blockJobPool: JobPool<BlocksJobData, BlocksJobResult>;

	private headerChain: BlockHeaderNode[];
	private hashToHeight: Map<bigint, number>;
	private prevHashToHeight: Map<bigint, number>;

	public getHeight(): number {
		return this.headerChain.length - 1;
	}
	public getTip(): BlockHeaderNode {
		return this.headerChain.at(-1)!;
	}

	constructor(baseDirectory: string, workerCount = navigator.hardwareConcurrency || 4) {
		console.log(`Using ${workerCount} workers`);
		this.workerCount = workerCount;
		this.baseDirectory = baseDirectory;

		const blockWorkerPath = import.meta.resolve("./workers/verifyBlocks.ts");
		this.blockJobPool = new JobPool<BlocksJobData, BlocksJobResult>(blockWorkerPath);

		this.headerChain = [];
		this.hashToHeight = new Map();
		this.prevHashToHeight = new Map();
		this.loadHeaderChain();
	}

	private loadHeaderChain(): void {
		const path = join(this.baseDirectory, "headers.dat");
		const size = existsSync(path) ? Deno.statSync(path).size : 0;
		if (size % BlockHeader.stride !== 0) {
			throw new Error("Invalid headers.dat file, size is not a multiple of header size");
		}

		this.headerChain.length = 0;
		this.hashToHeight.clear();
		this.prevHashToHeight.clear();
		this.headerChain.push({
			hash: GENESIS_BLOCK_HASH,
			header: GENESIS_BLOCK_HEADER,
			cumulativeWork: workFromHeader(GENESIS_BLOCK_HEADER),
		});
		this.prevHashToHeight.set(0n, 0);
		this.hashToHeight.set(bytesToNumberLE(GENESIS_BLOCK_HASH), 0);

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
				if (!equals(prevHash, this.getTip().hash)) {
					throw new Error(`Headers do not form a chain at height ${i}`);
				}
				const hash = sha256(sha256(header));
				if (!verifyProofOfWork(header, hash)) {
					throw new Error(`Invalid proof of work at height ${i}`);
				}
				const cumulativeWork = this.getTip().cumulativeWork + workFromHeader(header);
				const height = this.headerChain.length;
				this.headerChain.push({ hash, header, cumulativeWork });
				this.prevHashToHeight.set(bytesToNumberLE(prevHash), height);
				this.hashToHeight.set(bytesToNumberLE(hash), height);
			}
			file.close();
			console.log(
				`Loaded ${headerCount} headers. Height=${this.getHeight()} Work=${this.getTip().cumulativeWork}`,
			);
		}
	}

	private async saveHeaderChain(headersToAppend: BlockHeaderNode[]): Promise<void> {
		const path = join(this.baseDirectory, "headers.dat");
		await Deno.mkdir(dirname(path), { recursive: true });
		console.log(`Saving headers to ${path}`);
		const file = await Deno.open(path, { append: true, create: true });
		const writer = file.writable.getWriter();
		for (const { header } of headersToAppend) {
			await writer.write(header);
		}
		file.close();
		console.log("Headers saved");
	}

	private async truncateHeaderChain(height: number): Promise<void> {
		const size = (height + 1) * BlockHeader.stride;
		const path = join(this.baseDirectory, "headers.dat");
		const file = await Deno.open(path, { read: true, write: true });
		await file.truncate(size);
		file.close();
	}

	public async downloadHeaders(ctx: Bitcoin, peer: Peer): Promise<void> {
		const peerChain = Array.from(this.headerChain);

		const buildLocatorHashes = (): Uint8Array[] => {
			const locators: Uint8Array[] = [];
			let step = 1;
			let index = peerChain.length - 1;
			while (index >= 0) {
				locators.push(peerChain[index]!.hash);
				if (locators.length >= 10) step <<= 1;
				index -= step;
			}
			if (!equals(locators.at(-1)!, GENESIS_BLOCK_HASH)) locators.push(GENESIS_BLOCK_HASH);
			return locators;
		};

		let locators = buildLocatorHashes();

		const getHeight = () => peerChain.length - 1;
		const getTip = () => peerChain.at(-1)!;

		let chainSeparation: { commonHeight: number } | null = null;

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

			if (!equals(firstPrevHash, getTip().hash)) {
				if (chainSeparation) {
					throw new Error("Chain split twice from same peer, aborting");
				}

				chainSeparation = { commonHeight: this.hashToHeight.get(bytesToNumberLE(firstPrevHash)) ?? 0 };
				if (chainSeparation.commonHeight > 0) {
					// rewind candidate to the fork point
					peerChain.length = chainSeparation.commonHeight + 1;
					locators = buildLocatorHashes();
					peer.log(`Rewound to height ${chainSeparation.commonHeight} to resolve a fork`);
				} else {
					// unknown fork point; restart from genesis locators but keep current candidate
					locators[0] = GENESIS_BLOCK_HASH;
					locators.length = 1;
					// shrink candidate to just genesis, we’ll rebuild from a known point
					peerChain.length = 1;
					peer.log("Fork detected, restarting from genesis");
				}
			}

			for (let i = 0; i < count; i++) {
				const headerOffset = countSize + i * (BlockHeader.stride + 1);
				const header = headers.subarray(headerOffset, headerOffset + BlockHeader.stride);
				const prevHash = header.subarray(
					BlockHeader.shape.version.stride,
					BlockHeader.shape.version.stride + BlockHeader.shape.prevHash.stride,
				);
				if (!equals(prevHash, getTip().hash)) {
					console.log(humanize(prevHash), humanize(getTip().hash));
					throw new Error(`Headers do not form a chain at height ${getHeight() + 1}`);
				}

				const hash = sha256(sha256(header));
				if (!verifyProofOfWork(header, hash)) {
					throw new Error(`Invalid proof of work at height ${getHeight() + 1}, hash ${humanize(hash)}`);
				}
				const cumulativeWork = getTip().cumulativeWork + workFromHeader(header);
				peerChain.push({ hash, header, cumulativeWork });
			}

			locators[0] = getTip().hash;
			locators.length = 1;
			peer.log(
				`Downloaded ${getHeight()} headers, latest: ${
					humanize(getTip().hash)
				}, work=${getTip().cumulativeWork}`,
			);
		}

		// commit only if cumulative work improved (true "longest" chain)
		if (getTip().cumulativeWork > this.getTip().cumulativeWork) {
			peer.log(`Updating chain: height ${this.getHeight()} → ${peerChain.length - 1}`);
			if (chainSeparation) {
				await this.truncateHeaderChain(chainSeparation.commonHeight);
				const commonLength = chainSeparation.commonHeight + 1;
				await this.saveHeaderChain(peerChain.slice(commonLength));
			} else {
				await this.saveHeaderChain(peerChain.slice(this.headerChain.length));
			}

			this.headerChain = peerChain;
			this.prevHashToHeight.clear();
			this.hashToHeight.clear();
			for (const [height, { header, hash }] of this.headerChain.entries()) {
				const prevHash = header.subarray(
					BlockHeader.shape.version.stride,
					BlockHeader.shape.version.stride + BlockHeader.shape.prevHash.stride,
				);
				this.prevHashToHeight.set(bytesToNumberLE(prevHash), height);
				this.hashToHeight.set(bytesToNumberLE(hash), height);
			}
			peer.log(`Chain updated. Height=${this.getHeight()} Work=${this.getTip().cumulativeWork}`);
		} else {
			peer.log(`Kept existing tip. Height=${this.getHeight()} Work=${this.getTip().cumulativeWork}`);
		}

		peer.log();
	}
}
