import { sha256 } from "@noble/hashes/sha2";
import { bool, Bytes, Struct, u16, u32 } from "@nomadshiba/codec";
import { equals } from "@std/bytes";
import { existsSync } from "@std/fs";
import { dirname, join } from "@std/path";
import { BlockHeader } from "../primitives/BlockHeader.ts";
import { Chain } from "./Chain.ts";
import { ChainNode } from "./ChainNode.ts";
import { verifyProofOfWork, workFromHeader } from "./utils.ts";

const Item = new Struct({
	header: new Bytes(BlockHeader.stride),
	blockLocation: new Struct({ enabled: bool, chunkId: u16, offset: u32 }),
});

export class ChainStore {
	public readonly path: string;
	constructor(path: string) {
		this.path = path;
	}

	public async append(headers: ArrayIterator<ChainNode>): Promise<void> {
		await Deno.mkdir(dirname(this.path), { recursive: true });
		console.log(`Saving headers to ${this.path}`);
		const file = await Deno.open(this.path, { append: true, create: true });
		const writer = file.writable.getWriter();
		for (const { header, blockLocation } of headers) {
			await writer.write(
				Item.encode({
					header,
					blockLocation: blockLocation
						? { enabled: true, ...blockLocation }
						: { enabled: false, chunkId: 0, offset: 0 },
				}),
			);
		}
		file.close();
		console.log("Headers saved");
	}

	public async truncate(height: number): Promise<void> {
		const size = (height + 1) * Item.stride;
		const path = join(this.path);
		const file = await Deno.open(path, { read: true, write: true });
		await file.truncate(size);
		file.close();
		[].entries;
	}

	public load(chain: Chain): void {
		const path = this.path;
		const size = existsSync(path) ? Deno.statSync(path).size : 0;
		if (size % Item.stride !== 0) {
			throw new Error("Invalid headers.dat file, size is not a multiple of header size");
		}

		chain.clear();

		if (size > 0) {
			Deno.mkdirSync(dirname(path), { recursive: true });
			const file = Deno.openSync(path, { read: true });
			const headerCount = size / Item.stride;
			console.log(`Loading ${headerCount} headers from ${path}`);

			for (let i = 0; i < headerCount; i++) {
				const itemBytes = new Uint8Array(Item.stride);
				const bytesRead = file.readSync(itemBytes);
				if (bytesRead !== Item.stride) {
					throw new Error("Failed to read full header from headers.dat");
				}
				const { header, blockLocation } = Item.decode(itemBytes);
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
				chain.append({
					hash,
					header,
					cumulativeWork,
					blockLocation: blockLocation.enabled
						? { chunkId: blockLocation.chunkId, offset: blockLocation.offset }
						: null,
				});
			}
			file.close();
			console.log(
				`Loaded ${headerCount} headers. Height=${chain.getHeight()} Work=${chain.getTip().cumulativeWork}`,
			);
		}
	}
}
