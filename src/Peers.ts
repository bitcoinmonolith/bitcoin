import { Socket } from "net";
import { CommandBuffer } from "./CommandBuffer.js";

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

	private readonly socket: Socket;
	private readonly messageBuffer = new CommandBuffer<Peer.Message>();

	constructor(host: string, port: number) {
		this.host = host;
		this.port = port;
		this.socket = new Socket();
	}

	async connect(): Promise<void> {
		if (this.#connected) return;

		console.log(`🌐 Connecting to peer ${this.host}:${this.port}...`);

		await new Promise<void>((resolve, reject) => {
			const onError = (err: Error) => reject(err);
			this.socket.once("error", onError);
			this.socket.connect(this.port, this.host, () => {
				this.socket.off("error", onError);
				resolve();
			});
		});

		this.#connected = true;
		console.log(`✅ Connected to ${this.host}:${this.port}`);

		this.socket.on("error", (err) => {
			console.error(`❌ Socket error from ${this.host}:${this.port} → ${err.message}`);
		});

		this.socket.on("close", () => {
			this.#connected = false;
			console.log(`👋 Disconnected from ${this.host}:${this.port}`);
		});

		this.socket.on("data", (buffer: Buffer) => {
			const command = buffer.subarray(0, 12).toString("ascii").replace(/\0| /g, "");
			const payload = buffer.subarray(12);
			console.log(`📨 Received: ${command} (${payload.length} bytes)`);
			this.messageBuffer.push({ command, payload });
		});
	}

	async disconnect(): Promise<void> {
		if (!this.#connected) return;
		this.#connected = false;

		console.log(`🔌 Disconnecting from ${this.host}:${this.port}...`);

		await new Promise<void>((resolve) => {
			this.socket.end(resolve);
		});
	}

	async send<T>(type: Peer.MessageType<T>, data: T): Promise<void> {
		if (!this.connected) throw new Error("Peer is not connected");

		const cmdBuf = Buffer.alloc(12, " ");
		cmdBuf.write(type.command, "ascii");
		const full = Buffer.concat([cmdBuf, type.serialize(data)]);

		console.log(`📤 Sending: ${type.command} (${full.length - 12} bytes)`);

		return new Promise((resolve, reject) => {
			this.socket.write(full, (err) => {
				if (err) reject(err);
				else resolve();
			});
		});
	}

	consumeMessages() {
		return this.messageBuffer.consume();
	}
}
