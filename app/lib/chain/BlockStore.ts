import { dirname, join } from "@std/path";
import { existsSync } from "@std/fs";
import { Block } from "~/lib/satoshi/primitives/Block.ts";
import { BlockHeightIndex } from "./BlockHeightIndex.ts";
import { Tx } from "../satoshi/primitives/Tx.ts";
import { StoredTx } from "./primitives/StoredTx.ts";

export namespace BlockStore {
	export type Init = {
		maxFileSize: number;
		baseDirectory: string;
		blockHeightIndex: BlockHeightIndex;
	};
}

export class BlockStore {
	private readonly baseDirectory: string;
	private readonly maxFileSize: number;
	private readonly heightIndex: BlockHeightIndex;

	private pointer: number;
	private currentFile: Deno.FsFile;

	constructor(init: BlockStore.Init) {
		this.baseDirectory = init.baseDirectory;
		this.heightIndex = init.blockHeightIndex;
		this.maxFileSize = init.maxFileSize;

		this.pointer = this.heightIndex.tip() ?? 0;
		const chunkId = Math.floor(this.pointer / this.maxFileSize);
		const chunkOffset = this.pointer % this.maxFileSize;
		const chunkFilePath = this.getFilePath(chunkId);

		Deno.mkdirSync(dirname(chunkFilePath), { recursive: true });
		if (existsSync(chunkFilePath)) {
			this.currentFile = Deno.openSync(chunkFilePath, { read: true, write: true });
			this.currentFile.seekSync(chunkOffset, Deno.SeekMode.Start);
		} else {
			this.currentFile = Deno.openSync(chunkFilePath, { append: true, create: true, write: true });
		}
	}

	private getFilePath(chunkId: number): string {
		const filename = `chunk${chunkId}.dat`;
		return join(this.baseDirectory, filename);
	}

	/**
	 * Append block data to the store and return its pointer.
	 */
	public async append(txs: Uint8Array[]): Promise<number> {
		const storedTxs = txs.map((tx): StoredTx => {
			const [_parsed] = Tx.decode(tx);

			return {
				id: tx,
			};
		});

		// Now you can use storedTxs for further processing
	}

	/**
	 * Read data from the store using a global pointer and length.
	 */
	public async read(pointer: number, length: number): Promise<Uint8Array> {
		const fileId = Math.floor(pointer / this.maxFileSize);
		const fileOffset = pointer % this.maxFileSize;

		const path = this.getFilePath(fileId);
		if (!existsSync(path)) {
			throw new Error(`Block file ${path} does not exist`);
		}

		const file = await Deno.open(path, { read: true });
		try {
			await file.seek(fileOffset, Deno.SeekMode.Start);
			const data = new Uint8Array(length);
			const bytesRead = await file.read(data);

			if (bytesRead !== length) {
				throw new Error(`Expected to read ${length} bytes, but read ${bytesRead}`);
			}

			return data;
		} finally {
			file.close();
		}
	}

	/**
	 * Read a slice of data from pointer to pointer+length.
	 * Handles reads that span multiple files.
	 */
	public readSlice(startPointer: number, endPointer: number): Promise<Uint8Array> {
		const length = endPointer - startPointer;
		return this.read(startPointer, length);
	}

	/**
	 * Update data at a specific pointer location.
	 * WARNING: Size must not change - only for in-place updates like flag flips.
	 */
	public async update(pointer: number, data: Uint8Array): Promise<void> {
		const fileId = Math.floor(pointer / this.maxFileSize);
		const fileOffset = pointer % this.maxFileSize;

		const path = this.getFilePath(fileId);
		if (!existsSync(path)) {
			throw new Error(`Block file ${path} does not exist`);
		}

		const file = await Deno.open(path, { read: true, write: true });
		try {
			await file.seek(fileOffset, Deno.SeekMode.Start);
			await file.write(data);
		} finally {
			file.close();
		}
	}

	/**
	 * Close any open files.
	 */
	public close(): void {
		if (this.currentFile) {
			this.currentFile.close();
			this.currentFile = null;
		}
	}

	/**
	 * Flush current file to disk.
	 */
	public async flush(): Promise<void> {
		if (this.currentFile) {
			await this.currentFile.sync();
		}
	}

	/**
	 * Append a block and index it by height.
	 */
	public async appendBlock(blockData: Uint8Array): Promise<number> {
		const pointer = await this.append(blockData);
		await this.heightIndex.setPointer(height, pointer);
		return pointer;
	}

	/**
	 * Read a block by height.
	 */
	public async readBlockByHeight(height: number): Promise<Uint8Array> {
		const pointer = this.heightIndex.getPointer(height);
		if (pointer === undefined) {
			throw new Error(`No block found at height ${height}`);
		}

		// Read block size from the data (we need to decode the block to know its size)
		// For now, read a large chunk and decode to find actual size
		// TODO: We could store block sizes in the index for efficiency
		const maxBlockSize = 4 * 1024 * 1024; // 4MB max
		const blockData = await this.read(pointer, maxBlockSize);

		// Decode to find actual size
		const [, actualSize] = Block.decode(blockData);

		// Return only the actual block data
		return blockData.subarray(0, actualSize);
	}

	/**
	 * Get the highest block height stored.
	 */
	public getHighestHeight(): number {
		return this.heightIndex.height();
	}
}
