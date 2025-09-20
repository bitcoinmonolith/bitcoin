import { dirname, join } from "@std/path";
import { ChainNode } from "./ChainNode.ts";
import { BlockHeader } from "../primitives/BlockHeader.ts";
import { existsSync } from "@std/fs";
import { Chain } from "./Chain.ts";
import { GENESIS_BLOCK_HASH, GENESIS_BLOCK_HEADER } from "../constants.ts";
import { verifyProofOfWork, workFromHeader } from "./utils.ts";
import { sha256 } from "@noble/hashes/sha2";
import { equals } from "@std/bytes";

export class ChainStore {
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
