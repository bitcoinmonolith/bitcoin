import { sha256 } from "@noble/hashes/sha2";
import { Codec } from "@nomadshiba/struct-js";
import { BytesView } from "~/lib/BytesView.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("ascii");

export declare namespace Peer {
	export type MessagePayload = {
		command: string;
		payload: Uint8Array;
	};

	export type Message<T> = {
		command: string;
		codec: Codec<T>;
	};

	export type Error = {
		message: string;
	};

	export type Listener = (payload: Peer.MessagePayload) => void;
	export type Unlistener = () => void;
}

export class Peer {
	#connected = false;
	public get connected() {
		return this.#connected;
	}

	public readonly host: string;
	public readonly port: number;
	public readonly magic: Uint8Array;

	private readonly listeners: Set<Peer.Listener> = new Set();
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

						const indexView = new BytesView(inbox);
						const length = indexView.getUint32(16, true);
						const totalLength = 24 + length;
						if (inbox.length < totalLength) break;

						const command = textDecoder.decode(inbox.subarray(4, 16)).replace(/\0+$/, "");
						const payload = inbox.subarray(24, totalLength);

						for (const listener of this.listeners) {
							listener({ command, payload });
						}
						inbox = inbox.subarray(totalLength);
					}
				}
			} catch (err) {
				this.logError(err);
			} finally {
				this.disconnect();
			}
		});
	}

	disconnect(): void {
		if (!this.#connected || !this.connection) return;
		this.log(`🔌 Disconnecting from peer...`);
		this.#connected = false;
		this.connection.close();
		this.connection = null;
		this.log(`👋 Disconnected from peer`);
	}

	async send<T>(message: Peer.Message<T>, data: T): Promise<void> {
		if (!this.connected || !this.connection) throw new Error("Peer is not connected");

		const payload = message.codec.encode(data); // Uint8Array
		const bytes = new Uint8Array(24 + payload.length);
		const view = new BytesView(bytes);

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

	listen(listener: Peer.Listener): Peer.Unlistener {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	expect<T>(message: Peer.Message<T>, matcher: (data: T, raw: Uint8Array) => boolean): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const unlisten = this.listen((msg) => {
				if (msg.command !== message.command) return;
				const data = message.codec.decode(msg.payload);
				if (!matcher(data, msg.payload)) return;
				this.log(`✅ Matched expected ${msg.command}`);
				unlisten();
				resolve(data);
			});

			setTimeout(() => {
				unlisten();
				reject(new Error(`Timeout waiting for ${message.command}`));
			}, 30000);
		});
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
