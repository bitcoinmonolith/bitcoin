import { Socket } from "net";
import { CommandBuffer } from "~/CommandBuffer.js";
import { checksum } from "~/utils.js";

export namespace Peer {
	export type Message = {
		command: string;
		payload: Buffer;
	};

	export type MessageType<T> = {
		command: string;
		serialize(data: T): Buffer;
		deserialize(buffer: Buffer): T;
	};

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
	private readonly magic: Buffer;

	private readonly socket: Socket;
	private readonly messageBuffer = new CommandBuffer<Peer.Message>();

	constructor(host: string, port: number, magic: Buffer) {
		this.host = host;
		this.port = port;
		this.magic = magic;
		this.socket = new Socket();
	}

	async connect(): Promise<void> {
		if (this.#connected) return;

		this.log(`🌐 Connecting to peer...`);

		await new Promise<void>((resolve, reject) => {
			const onError = (err: Error) => reject(err);
			this.socket.once("error", onError);
			this.socket.connect(this.port, this.host, () => {
				this.socket.off("error", onError);
				resolve();
			});
		});

		this.#connected = true;
		this.log(`✅ Connected to peer`);

		this.socket.on("error", (err) => {
			this.logError(`❌ Socket error: ${err.message}`);
		});

		this.socket.on("close", () => {
			this.#connected = false;
			this.log(`👋 Disconnected from peer`);
		});

		let inbox = Buffer.alloc(0);
		this.socket.on("data", (data: Buffer) => {
			inbox = Buffer.concat([inbox, data]);

			while (inbox.length >= 24) {
				const length = inbox.readUInt32LE(16);
				const totalLength = 24 + length;
				if (inbox.length < totalLength) break;

				const command = inbox.toString("ascii", 4, 16).replace(/\0+$/, "");
				const payload = inbox.subarray(24, totalLength);

				// this.log(`📨 Received: ${command} (${payload.length} bytes)`);

				this.messageBuffer.push({ command, payload });

				inbox = inbox.subarray(totalLength);
			}
		});
	}

	async disconnect(): Promise<void> {
		if (!this.#connected) return;
		this.#connected = false;

		this.log(`🔌 Disconnecting from peer...`);

		await new Promise<void>((resolve) => {
			this.socket.end(resolve);
		});
	}

	async send<T>(type: Peer.MessageType<T>, data: T): Promise<void> {
		if (!this.connected) throw new Error("Peer is not connected");

		const payload = type.serialize(data);
		const buffer = Buffer.alloc(24 + payload.length);
		this.magic.copy(buffer, 0);
		buffer.write(type.command, 4, "ascii");
		buffer.writeUInt32LE(payload.length, 16);
		checksum(payload).copy(buffer, 20);
		payload.copy(buffer, 24);

		this.log(`📤 Sending: ${type.command} (${payload.length} bytes)`);

		return new Promise((resolve, reject) => {
			this.socket.write(buffer, (err) => {
				if (err) reject(err);
				else resolve();
			});
		});
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
