import { BasicBlockParser } from "./BasicBlockParser.js";
import { BasicBlockValidator } from "./BasicBlockValidator.js";
import { MemoryBlockStore } from "./MemoryBlockStore.js";
import { MemoryChain } from "./MemoryChain.js";
import { Peer } from "./Peers.js";

type MessageHandler<T> = {
	type: Peer.MessageType<T>;
	handler(event: MessageEvent<T>): Promise<void>;
};

type MessageEvent<T> = {
	peer: Peer;
	data: T;
};

await start();
async function start() {
	const parser = new BasicBlockParser();
	const validator = new BasicBlockValidator();
	const store = new MemoryBlockStore();
	const chain = new MemoryChain();

	const peers = new Set<Peer>();

	async function sendPing(peer: Peer, data: Ping) {
		console.log(`📤 Sending ping to ${peer.host}:${peer.port}`);
		await peer.send(Ping, data);
		await expect(peer, Pong, (pong) => pong.nonce === data.nonce);
		console.log(`🏓 Pong received from ${peer.host}:${peer.port}`);
	}

	async function sendVersion(peer: Peer) {
		const versionMsg: Version = {
			version: 70015,
			services: 0n,
			timestamp: BigInt(Math.floor(Date.now() / 1000)),
			nonce: BigInt(Math.floor(Math.random() * 1e10)),
			startHeight: 0,
			userAgent: "/UserNode:0.1.0/",
		};

		await peer.send(Version, versionMsg);
		await expect(peer, Verack, () => true);
		console.log(`📗 Sent version to ${peer.host}:${peer.port}`);
	}

	const PongHandler: MessageHandler<Ping> = {
		type: Ping,
		async handler({ peer, data }) {
			await peer.send(Pong, data);
		},
	};

	const VersionHandler: MessageHandler<Version> = {
		type: Version,
		async handler({ peer, data }) {
			console.log(`🤝 Received version from ${peer.host}:${peer.port}: v${data.version}, ua=${data.userAgent}`);
			await peer.send(Verack, {});
		},
	};

	const VerackHandler: MessageHandler<Verack> = {
		type: Verack,
		async handler({ peer }) {
			console.log(`✅ Handshake complete with ${peer.host}:${peer.port}`);
		},
	};

	const handlers: MessageHandler<unknown>[] = [PongHandler, VersionHandler, VerackHandler];
	const handlersMap = new Map(handlers.map((handler) => [handler.type.command, handler] as const));
	const handlersQueueByPeer = new WeakMap<Peer, { busy: boolean; calls: { (): Promise<void> }[] }>();

	type MessageExpector<T> = {
		type: Peer.MessageType<T>;
		resolvers: PromiseWithResolvers<T>;
		matcher(data: T): boolean;
	};
	const expectorsByTypeByPeer = new WeakMap<Peer, Map<string, Set<MessageExpector<any>>>>();
	function expect<T>(peer: Peer, type: Peer.MessageType<T>, matcher: (data: T) => boolean) {
		let expectorsByType = expectorsByTypeByPeer.get(peer);
		if (!expectorsByType) {
			expectorsByTypeByPeer.set(peer, (expectorsByType = new Map()));
		}
		let expectors = expectorsByType.get(type.command);
		if (!expectors) {
			expectorsByType.set(type.command, (expectors = new Set()));
		}

		const resolvers = Promise.withResolvers<T>();
		expectors.add({ resolvers, type, matcher });

		console.log(`🔭 Expecting: ${type.command} from ${peer.host}:${peer.port}`);

		return resolvers.promise;
	}

	while (true) {
		try {
			await tick();
		} catch (error) {
			console.error(error);
		} finally {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}
	async function tick() {
		for (const peer of peers) {
			const expectorsByType = expectorsByTypeByPeer.get(peer);

			let commandQueue = handlersQueueByPeer.get(peer);
			if (!commandQueue) {
				handlersQueueByPeer.set(peer, (commandQueue = { busy: false, calls: [] }));
			}

			for (const message of peer.consumeMessages()) {
				const expectors = expectorsByType?.get(message.command);
				if (expectors?.size) {
					for (const expector of expectors) {
						const data = expector.type.deserialize(message.payload);
						if (!expector.matcher(data)) continue;
						expectors.delete(expector);
						console.log(`✅ Matched expected ${message.command} from ${peer.host}:${peer.port}`);
						expector.resolvers.resolve(data);
					}
					continue;
				}

				const handler = handlersMap.get(message.command);
				if (handler) {
					const data = handler.type.deserialize(message.payload);
					commandQueue.calls.push(() => {
						console.log(`📥 Handling ${message.command} from ${peer.host}:${peer.port}`);
						return handler.handler({ peer, data });
					});
					continue;
				}

				console.warn(`⚠️ Unhandled message: ${message.command} from ${peer.host}:${peer.port}`);
			}

			if (!commandQueue.busy) {
				const call = commandQueue.calls.shift();
				if (call) {
					commandQueue.busy = true;
					call()
						.catch((err) => console.error(`❌ Handler error from ${peer.host}:${peer.port}:`, err))
						.finally(() => (commandQueue.busy = false));
				}
			}
		}
	}
}

type Ping = { nonce: bigint };
const Ping: Peer.MessageType<Ping> = {
	command: "ping",
	serialize(data) {
		const buffer = Buffer.alloc(8);
		buffer.writeBigUInt64LE(data.nonce);
		return buffer;
	},
	deserialize(buffer) {
		return {
			nonce: buffer.readBigUInt64LE(0),
		};
	},
};

type Pong = { nonce: bigint };
const Pong: Peer.MessageType<Pong> = {
	command: "pong",
	serialize(data) {
		const buffer = Buffer.alloc(8);
		buffer.writeBigUInt64LE(data.nonce);
		return buffer;
	},
	deserialize(buffer) {
		return {
			nonce: buffer.readBigUInt64LE(0),
		};
	},
};

type Version = {
	version: number;
	services: bigint;
	timestamp: bigint;
	nonce: bigint;
	startHeight: number;
	userAgent: string;
};

export namespace Serializer {
	export function u32(n: number): Buffer {
		const b = Buffer.alloc(4);
		b.writeUInt32LE(n, 0);
		return b;
	}

	export function i64(n: bigint): Buffer {
		const b = Buffer.alloc(8);
		b.writeBigInt64LE(n, 0);
		return b;
	}

	export function u64(n: bigint): Buffer {
		const b = Buffer.alloc(8);
		b.writeBigUInt64LE(n, 0);
		return b;
	}

	export function u8(n: number): Buffer {
		const b = Buffer.alloc(1);
		b.writeUInt8(n, 0);
		return b;
	}
}

const Version: Peer.MessageType<Version> = {
	command: "version",
	serialize(data) {
		const userAgentBuffer = Buffer.from(data.userAgent, "utf8");
		const userAgentLenght = Serializer.u8(userAgentBuffer.length);

		const buffer = Buffer.concat([
			Serializer.u32(data.version),
			Serializer.u64(data.services),
			Serializer.i64(data.timestamp),
			Serializer.u64(data.nonce),
			userAgentLenght, // 🛠 Used here
			userAgentBuffer,
			Serializer.u32(data.startHeight),
		]);

		return buffer;
	},
	deserialize(buf) {
		const version = buf.readInt32LE(0);
		const services = buf.readBigUInt64LE(4);
		const timestamp = buf.readBigInt64LE(12);
		const nonce = buf.readBigUInt64LE(20);

		const userAgentLen = buf.readUInt8(28);
		const userAgent = buf.subarray(29, 29 + userAgentLen).toString("utf8");
		const startHeight = buf.readInt32LE(29 + userAgentLen);

		return { version, services, timestamp, nonce, userAgent, startHeight };
	},
};

type Verack = {};
const Verack: Peer.MessageType<Verack> = {
	command: "verack",
	serialize: () => Buffer.alloc(0),
	deserialize: () => ({}),
};
