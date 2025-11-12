import { exists, existsSync } from "@std/fs";
import { dirname, join } from "@std/path";
import { BlockHeightIndex } from "./BlockHeightIndex.ts";
import { StoredBlock } from "./primitives/StoredBlock.ts";

export namespace BlockStore {
	export type Init = {
		maxFileSize: number;
		baseDirectory: string;
		blockPointerIndex: BlockHeightIndex;
	};
}

export class BlockStore {
	private readonly baseDirectory: string;
	private readonly maxFileSize: number;
	private readonly pointerIndex: BlockHeightIndex;

	private pointer: number;
	private currentFile: Deno.FsFile | null = null;

	constructor(init: BlockStore.Init) {
		this.baseDirectory = init.baseDirectory;
		this.pointerIndex = init.blockPointerIndex;
		this.maxFileSize = init.maxFileSize;

		this.pointer = this.pointerIndex.tip() ?? 0;
	}

	private getFilePath(chunkId: number): string {
		const filename = `chunk${chunkId}.dat`;
		return join(this.baseDirectory, filename);
	}

	private async ensureCurrentFile(incomingSize: number): Promise<Deno.FsFile> {
		const newPointer = this.pointer + incomingSize;
		const chunkId = Math.floor(newPointer / this.maxFileSize);
		const chunkOffset = newPointer % this.maxFileSize;
		const chunkFilePath = this.getFilePath(chunkId);

		await Deno.mkdir(dirname(chunkFilePath), { recursive: true });
		if (existsSync(chunkFilePath)) {
			this.currentFile = await Deno.open(chunkFilePath, { read: true, write: true });
			await this.currentFile.seek(chunkOffset, Deno.SeekMode.Start);
		} else {
			this.currentFile = await Deno.open(chunkFilePath, { append: true, create: true, write: true });
		}

		return this.currentFile;
	}

	public async append(block: StoredBlock): Promise<void> {
		const blockBytes = StoredBlock.encode(block);

		const file = await this.ensureCurrentFile(blockBytes.byteLength);

		const writeResult = await file.write(blockBytes);
		if (writeResult < blockBytes.byteLength) {
			throw new Error("Could not write entire block to storage");
		}

		await this.pointerIndex.append([this.pointer]);

		this.pointer += blockBytes.byteLength;
	}

	public async truncate(blockHeight: number): Promise<void> {
		const pointer = this.pointerIndex.at(blockHeight);
		if (pointer === undefined) {
			throw new Error(`No block found at height ${blockHeight}`);
		}

		this.pointer = pointer;
		const chunkId = Math.floor(this.pointer / this.maxFileSize);
		const chunkOffset = this.pointer % this.maxFileSize;
		const chunkFilePath = this.getFilePath(chunkId);

		if (!await exists(chunkFilePath)) {
			throw new Error(`Block file ${chunkFilePath} does not exist`);
		}

		this.currentFile?.close();
		this.currentFile = await Deno.open(chunkFilePath, { read: true, write: true });
		await this.currentFile.seek(chunkOffset, Deno.SeekMode.Start);

		// Truncate any subsequent files
		let nextChunkId = chunkId + 1;
		while (true) {
			const nextChunkFilePath = this.getFilePath(nextChunkId);
			if (await exists(nextChunkFilePath)) {
				await Deno.remove(nextChunkFilePath);
				nextChunkId++;
			} else {
				break;
			}
		}

		this.pointerIndex.truncate(blockHeight);
	}

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
			const buffer = new Uint8Array(length);
			const bytesRead = await file.read(buffer);
			if (bytesRead === null || bytesRead < length) {
				console.log("bytesRead:", bytesRead, "requested length:", length);
				throw new Error("Could not read full block data from storage");
			}
			return buffer;
		} finally {
			file.close();
		}
	}

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

	public close(): void {
		this.currentFile?.close();
		this.currentFile = null;
	}

	public async flush(): Promise<void> {
		await this.currentFile?.sync();
	}

	public async at(height: number): Promise<StoredBlock> {
		const pointer = this.pointerIndex.at(height);
		if (pointer === undefined) {
			throw new Error(`No block found at height ${height}`);
		}

		const next4Mb = await this.read(pointer, 4 * 1024 * 1024);
		const [block] = StoredBlock.decode(next4Mb);
		return block;
	}

	public height(): number {
		return this.pointerIndex.height();
	}
}
