import { sha256 } from "@noble/hashes/sha2";
import { exists, existsSync } from "@std/fs";
import { dirname, join } from "@std/path";
import { Tx } from "../satoshi/primitives/Tx.ts";
import { SequenceLock } from "../satoshi/primitives/weirdness/SequenceLock.ts";
import { TimeLock } from "../satoshi/primitives/weirdness/TimeLock.ts";
import { BlockHeightIndex } from "./BlockHeightIndex.ts";
import { StoredBlock } from "./primitives/StoredBlock.ts";
import { StoredTx } from "./primitives/StoredTx.ts";
import { StoredTxInput } from "./primitives/StoredTxInput.ts";
import { StoredTxOutput } from "./primitives/StoredTxOutput.ts";

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

	public async append(blockBody: Uint8Array): Promise<void> {
		const txs: StoredTx[] = [];
		let offset = 0;
		while (offset < blockBody.length) {
			const [tx, bytesRead] = Tx.decode(blockBody.subarray(offset));
			const txId = sha256(sha256(Tx.encode(tx)));
			txs.push({
				txId,
				lockTime: TimeLock.encode(tx.lockTime),
				version: tx.version,
				vin: tx.vin.map((vin): StoredTxInput => ({
					kind: "unresolved",
					value: {
						prevOut: {
							txId: vin.txId,
							vout: vin.vout,
						},
						scriptSig: vin.scriptSig,
						sequence: SequenceLock.encode(vin.sequenceLock),
						witness: vin.witness,
					},
				})),
				vout: tx.vout.map((vout): StoredTxOutput => ({
					scriptType: "raw",
					scriptPubKey: vout.scriptPubKey,
					value: vout.value,
					spent: false,
				})),
			});
			offset += bytesRead;
		}

		const block = StoredBlock.encode(txs);
		const file = await this.ensureCurrentFile(block.byteLength);

		const writeResult = await file.write(block);
		if (writeResult < block.byteLength) {
			throw new Error("Could not write entire block to storage");
		}
		this.pointer += block.byteLength;
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
		const startFileId = Math.floor(pointer / this.maxFileSize);
		const startFileOffset = pointer % this.maxFileSize;

		const endPointer = pointer + length;
		const endFileId = Math.floor(endPointer / this.maxFileSize);
		const endFileOffset = endPointer % this.maxFileSize;

		const chunks: Uint8Array[] = [];

		for (let fileId = startFileId; fileId <= endFileId; fileId++) {
			const path = this.getFilePath(fileId);
			if (!existsSync(path)) {
				throw new Error(`Block file ${path} does not exist`);
			}

			const file = await Deno.open(path, { read: true });
			try {
				let readStart = 0;
				let readEnd = this.maxFileSize;

				if (fileId === startFileId) {
					readStart = startFileOffset;
				}
				if (fileId === endFileId) {
					readEnd = endFileOffset;
				}

				const readLength = readEnd - readStart;
				const buffer = new Uint8Array(readLength);
				await file.seek(readStart, Deno.SeekMode.Start);
				const bytesRead = await file.read(buffer);
				if (bytesRead === null || bytesRead < readLength) {
					throw new Error(`Could not read enough data from block file ${path}`);
				}
				chunks.push(buffer);
			} finally {
				file.close();
			}
		}

		// Concatenate chunks into a single Uint8Array
		const result = new Uint8Array(length);
		let offset = 0;
		for (const chunk of chunks) {
			result.set(chunk, offset);
			offset += chunk.length;
		}

		return result;
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

	public height(): number {
		return this.pointerIndex.height();
	}
}
