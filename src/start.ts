import dns from "dns/promises";
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

const TESTNET_MAGIC = Buffer.from("0b110907", "hex");
const TESTNET_DNS_SEEDS = [
	"testnet-seed.bitcoin.jonasschnelli.ch",
	"seed.tbtc.petertodd.org",
	"testnet-seed.bluematt.me",
	"testnet-seed.bitcoin.sprovoost.nl",
];

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

	peer.log(`🔭 Expecting: ${type.command}`);

	return resolvers.promise;
}

const parser = new BasicBlockParser();
const validator = new BasicBlockValidator();
const store = new MemoryBlockStore();
const chain = new MemoryChain();

const peers = new Set<Peer>();

async function* resolveTestnetPeers() {
	for (const seed of TESTNET_DNS_SEEDS) {
		try {
			const peerAddresses = await dns.resolve(seed);
			for (const peerAddress of peerAddresses) {
				yield peerAddress;
			}
		} catch {}
	}
}

async function start() {
	const handlers: MessageHandler<unknown>[] = [VersionHandler];
	const handlersMap = new Map(handlers.map((handler) => [handler.type.command, handler] as const));
	const handlersQueueByPeer = new WeakMap<Peer, { busy: boolean; calls: { (): Promise<void> }[] }>();

	// This need better logic later in the tick to discover peers and stuff
	let peerCount = 0;
	for await (const host of resolveTestnetPeers()) {
		if (++peerCount > 1) break;
		const peer = new Peer(host, 18333, TESTNET_MAGIC);
		peers.add(peer);
		peer.connect().then(async () => {
			await sendVersion(peer);
		});
	}

	while (true) {
		try {
			await tick();
		} catch (error) {
			console.error("UNEXPECTED ERROR:", error);
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
						peer.log(`✅ Matched expected ${message.command}`);
						expector.resolvers.resolve(data);
					}
					continue;
				}

				const handler = handlersMap.get(message.command);
				if (handler) {
					const data = handler.type.deserialize(message.payload);
					commandQueue.calls.push(() => {
						peer.log(`📥 Handling ${message.command}`);
						return handler.handler({ peer, data });
					});
					continue;
				}

				peer.logWarn(`🛑 Unexpected: ${message.command}`);
			}

			if (!commandQueue.busy) {
				const call = commandQueue.calls.shift();
				if (call) {
					commandQueue.busy = true;
					call()
						.catch((err) => peer.logError(`❌ Handler error:`, err))
						.finally(() => (commandQueue.busy = false));
				}
			}
		}
	}
}

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

type Version = {
	version: number;
	services: bigint;
	timestamp: bigint;
	recvServices: bigint;
	recvPort: number;
	transServices: bigint;
	transPort: number;
	nonce: bigint;
	userAgent: string;
	startHeight: number;
	relay: boolean;
};

const Version: Peer.MessageType<Version> = {
	command: "version",
	serialize(data) {
		const userAgentBytes = Buffer.from(data.userAgent, "utf8");
		const userAgentLength = Buffer.from([userAgentBytes.length]);

		const buffer = Buffer.alloc(150);
		let offset = 0;

		buffer.writeInt32LE(data.version, offset);
		offset += 4;
		buffer.writeBigUInt64LE(data.services, offset);
		offset += 8;
		buffer.writeBigUInt64LE(data.timestamp, offset);
		offset += 8;
		buffer.writeBigUInt64LE(data.recvServices, offset);
		offset += 8;
		Buffer.alloc(16).copy(buffer, offset);
		offset += 16;
		buffer.writeUInt16BE(data.recvPort, offset);
		offset += 2;
		buffer.writeBigUInt64LE(data.transServices, offset);
		offset += 8;
		Buffer.alloc(16).copy(buffer, offset);
		offset += 16;
		buffer.writeUInt16BE(data.transPort, offset);
		offset += 2;
		buffer.writeBigUInt64LE(data.nonce, offset);
		offset += 8;

		userAgentLength.copy(buffer, offset);
		offset += userAgentLength.length;
		userAgentBytes.copy(buffer, offset);
		offset += userAgentBytes.length;

		buffer.writeInt32LE(data.startHeight, offset);
		offset += 4;
		buffer.writeUInt8(data.relay ? 1 : 0, offset);
		offset += 1;

		return buffer.slice(0, offset);
	},
	deserialize(buffer: Buffer) {
		let offset = 0;

		const version = buffer.readInt32LE(offset);
		offset += 4;
		const services = buffer.readBigUInt64LE(offset);
		offset += 8;
		const timestamp = buffer.readBigUInt64LE(offset);
		offset += 8;
		const recvServices = buffer.readBigUInt64LE(offset);
		offset += 8;

		const recvIP = buffer.slice(offset, offset + 16);
		offset += 16;
		const recvPort = buffer.readUInt16BE(offset);
		offset += 2;

		const transServices = buffer.readBigUInt64LE(offset);
		offset += 8;
		const transIP = buffer.slice(offset, offset + 16);
		offset += 16;
		const transPort = buffer.readUInt16BE(offset);
		offset += 2;

		const nonce = buffer.readBigUInt64LE(offset);
		offset += 8;

		const userAgentLength = buffer[offset]!;
		offset += 1;
		const userAgentStr = buffer.slice(offset, offset + userAgentLength).toString("utf8");
		offset += userAgentLength;

		const startHeight = buffer.readInt32LE(offset);
		offset += 4;

		const relay = !!buffer.readUInt8(offset);
		offset += 1;

		return {
			version,
			services,
			timestamp,
			recvServices,
			recvIP,
			recvPort,
			transServices,
			transIP,
			transPort,
			nonce,
			userAgent: userAgentStr,
			startHeight,
			relay,
		};
	},
};

type Verack = {};
const Verack: Peer.MessageType<Verack> = {
	command: "verack",
	serialize: () => Buffer.alloc(0),
	deserialize: () => ({}),
};

async function sendVersion(peer: Peer) {
	const versionMsg: Version = {
		version: 70015,
		services: 1n,
		timestamp: BigInt(Math.floor(Date.now() / 1000)),
		recvServices: 1n,
		recvPort: 18333,
		transServices: 1n,
		transPort: 18333,
		nonce: 987654321n,
		userAgent: "/Satoshi:MyCustomNode:0.2/",
		startHeight: 150000,
		relay: true,
	};

	await peer.send(Version, versionMsg);
	peer.log(`📗 Sent version`);
	await expect(peer, Verack, () => true);
	peer.log(`✅ Handshake complete`);
}

const VersionHandler: MessageHandler<Version> = {
	type: Version,
	async handler({ peer, data }) {
		peer.log(`🤝 Received version: v${data.version}, ua=${data.userAgent}`);
		await peer.send(Verack, {});
	},
};

await start();
