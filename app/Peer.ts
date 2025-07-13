import { sha256 } from "@noble/hashes/sha2";
import { CommandBuffer } from "./CommandBuffer.ts";
import { DataType } from "./DataType.ts";
import { BytesView } from "./BytesView.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("ascii");

export declare namespace Peer {
	export type MessagePayload = {
		command: string;
		payload: Uint8Array;
	};

	export type Message<T> = { command: string } & DataType<T>;

	export type Error = {
		message: string;
	};
}

export class Peer {
	#connected = false;
	public get connected() {
		return this.#connected;
	}

	public readonly host: string;
	public readonly port: number;
	public readonly magic: Uint8Array;

	private readonly messageCommandBuffer = new CommandBuffer<Peer.MessagePayload>();
	private connection: Deno.Conn | null = null;

	constructor(host: string, port: number, magic: Uint8Array) {
		this.host = host;
		this.port = port;
		this.magic = magic;
	}

	async connect(): Promise<void> {
		if (this.#connected) return;

		this.log(`🌐 Connecting to peer...`);

		const abortController = new AbortController();
		setTimeout(() => abortController.abort(), 5000);

		// Establish TCP connection using Deno.connect
		const connectionPromise = Deno.connect({
			hostname: this.host,
			port: this.port,
			transport: "tcp",
			signal: abortController.signal,
		});

		this.connection = await connectionPromise;
		this.#connected = true;
		this.log(`✅ Connected to peer`);

		// Start reading from connection
		connectionPromise.then(async (connection) => {
			let inbox: Uint8Array = new Uint8Array(0);

			try {
				const bytes = new Uint8Array(4096);
				while (this.#connected && connection.readable) {
					const n = await connection.read(bytes);
					if (n === null) break;
					if (n === 0) continue;

					{
						const indexCache = inbox;
						inbox = new Uint8Array(indexCache.byteLength + n);
						inbox.set(indexCache, 0);
						inbox.set(bytes.subarray(0, n), indexCache.byteLength);
					}

					while (inbox.length >= 24) {
						// Check magic
						let isMagic = true;
						for (let i = 0; i < 4; i++) {
							if (inbox[i] !== this.magic[i]) {
								isMagic = false;
								break;
							}
						}
						if (!isMagic) {
							this.logWarn(
								"⚠️ Bad magic. Skipping. Saw command:",
								textDecoder.decode(inbox.subarray(4, 16)).replace(/\0+$/, ""),
							);
							inbox = inbox.subarray(1); // try again from next byte
							continue;
						}

						const indexView = new DataView(inbox.buffer, inbox.byteOffset);
						const length = indexView.getUint32(16, true);
						const totalLength = 24 + length;
						if (inbox.length < totalLength) break;

						const command = textDecoder.decode(inbox.subarray(4, 16)).replace(/\0+$/, "");
						const payload = inbox.subarray(24, totalLength);

						this.messageCommandBuffer.push({ command, payload });
						inbox = inbox.subarray(totalLength);
					}
				}
			} catch (err) {
				this.logError(err);
			} finally {
				this.#connected = false;
				this.log(`👋 Disconnected from peer`);
				connection.close();
			}
		});
	}

	disconnect(): void {
		if (!this.#connected || !this.connection) return;
		this.#connected = false;
		this.log(`🔌 Disconnecting from peer...`);
		this.connection.close();
		this.connection = null;
	}

	async send<T>(message: Peer.Message<T>, data: T): Promise<void> {
		if (!this.connected || !this.connection) throw new Error("Peer is not connected");

		const payload = message.serialize(data); // Uint8Array
		const bytes = new Uint8Array(24 + payload.length);
		const view = BytesView(bytes);

		bytes.set(this.magic, 0);
		// Write command as ascii, pad with zeros
		const commandBytes = textEncoder.encode(message.command);
		bytes.set(commandBytes, 4);
		// Zero fill up to 16 bytes
		for (let i = 4 + commandBytes.length; i < 16; ++i) bytes[i] = 0;
		view.setUint32(16, payload.length, true);
		bytes.set(sha256(sha256(payload)).subarray(0, 4), 20);
		bytes.set(payload, 24);

		this.log(`📤 Sending: ${message.command} (${payload.length} bytes)`);

		await this.connection.write(bytes);
	}

	consumeMessages() {
		return this.messageCommandBuffer.consume();
	}

	log(...params: unknown[]) {
		console.log(`${this.host}:${this.port}`, "→", ...params);
	}
	logError(...params: unknown[]) {
		console.error(`${this.host}:${this.port}`, "→", ...params);
	}
	logWarn(...params: unknown[]) {
		console.warn(`${this.host}:${this.port}`, "→", ...params);
	}
}
