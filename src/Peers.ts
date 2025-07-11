import { CommandBuffer } from "./CommandBuffer.ts";
import { checksum, concatBytes, readUInt32LE, writeUInt32LE } from "./utils.ts";
import { DataType } from "./DataType.ts";

export declare namespace Peer {
	export type MessagePayload = {
		command: string;
		payload: Uint8Array;
	};

	export type MessageType<T> = { command: string } & DataType<T>;

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
	private readonly magic: Uint8Array;

	private connection: Deno.Conn | null = null;
	private readonly messageBuffer = new CommandBuffer<Peer.MessagePayload>();
	private readerRunning = false;

	constructor(host: string, port: number, magic: Uint8Array) {
		this.host = host;
		this.port = port;
		this.magic = magic;
	}

	async connect(): Promise<void> {
		if (this.#connected) return;

		this.log(`🌐 Connecting to peer...`);

		// Establish TCP connection using Deno.connect
		this.connection = await Deno.connect({
			hostname: this.host,
			port: this.port,
			transport: "tcp",
		});

		this.#connected = true;
		this.log(`✅ Connected to peer`);

		// Start reading from connection
		this.startReader();
	}

	private async startReader() {
		if (!this.connection || this.readerRunning) return;
		this.readerRunning = true;

		let inbox: Uint8Array = new Uint8Array(0);
		const conn = this.connection;
		try {
			const buffer = new Uint8Array(4096);
			while (this.#connected && conn.readable) {
				const n = await conn.read(buffer);
				if (n === null) break;
				if (n === 0) continue;
				inbox = concatBytes([inbox, buffer.subarray(0, n)]);

				while (inbox.length >= 24) {
					const length = readUInt32LE(inbox, 16);
					const totalLength = 24 + length;
					if (inbox.length < totalLength) break;

					const command = new TextDecoder("ascii").decode(inbox.subarray(4, 16)).replace(/\0+$/, "");
					const payload = inbox.subarray(24, totalLength);

					// this.log(`📨 Received: ${command} (${payload.length} bytes)`);
					this.messageBuffer.push({ command, payload });

					inbox = inbox.subarray(totalLength);
				}
			}
		} catch (err) {
			this.logError(err)
		} finally {
			this.#connected = false;
			this.log(`👋 Disconnected from peer`);
			conn.close();
		}
	}

	disconnect(): void {
		if (!this.#connected || !this.connection) return;
		this.#connected = false;
		this.log(`🔌 Disconnecting from peer...`);
		this.connection.close();
		this.connection = null;
	}

	async send<T>(type: Peer.MessageType<T>, data: T): Promise<void> {
		if (!this.connected || !this.connection) throw new Error("Peer is not connected");

		const payload = type.serialize(data); // Uint8Array
		const buffer = new Uint8Array(24 + payload.length);
		buffer.set(this.magic, 0);
		// Write command as ascii, pad with zeros
		const encoder = new TextEncoder();
		const commandEncoded = encoder.encode(type.command);
		buffer.set(commandEncoded, 4);
		// Zero fill up to 16 bytes
		for (let i = 4 + commandEncoded.length; i < 16; ++i) buffer[i] = 0;
		writeUInt32LE(buffer, payload.length, 16);
		buffer.set(await checksum(payload), 20);
		buffer.set(payload, 24);

		this.log(`📤 Sending: ${type.command} (${payload.length} bytes)`);

		await this.connection.write(buffer);
	}

	consumeMessages() {
		return this.messageBuffer.consume();
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
