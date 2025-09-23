import { sha256 } from "@noble/hashes/sha2";
import { Bytes } from "@nomadshiba/codec";
import { equals } from "@std/bytes";
import { existsSync } from "@std/fs";
import { dirname, join } from "@std/path";
import { BlockHeader } from "~/lib/satoshi/p2p/primitives/BlockHeader.ts";
import { Chain } from "~/lib/chain/Chain.ts";
import { ChainNode } from "~/lib/chain/ChainNode.ts";
import { verifyProofOfWork, workFromHeader } from "~/lib/chain/utils.ts";

const Item = new Bytes(BlockHeader.stride);

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
		for (const { header } of headers) {
			await writer.write(
				Item.encode(header),
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
				const header = Item.decode(itemBytes);
				const prevHash = header.subarray(
					BlockHeader.shape.version.stride,
					BlockHeader.shape.version.stride + BlockHeader.shape.prevHash.stride,
				);
				if (!equals(prevHash, chain.tip().hash)) {
					throw new Error(`Headers do not form a chain at height ${i}`);
				}
				const hash = sha256(sha256(header));
				if (!verifyProofOfWork(header, hash)) {
					throw new Error(`Invalid proof of work at height ${i}`);
				}
				const cumulativeWork = chain.tip().cumulativeWork + workFromHeader(header);
				chain.append({ hash, header, cumulativeWork });
			}
			file.close();
			console.log(
				`Loaded ${headerCount} headers. Height=${chain.height()} Work=${chain.tip().cumulativeWork}`,
			);
		}
	}
}
