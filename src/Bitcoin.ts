import dns from "dns/promises";
import { BasicBlockParser } from "./BasicBlockParser.js";
import { BasicBlockValidator } from "./BasicBlockValidator.js";
import { BlockParser, BlockStore, BlockValidator, Chain } from "./Blocks.js";
import { MemoryBlockStore } from "./MemoryBlockStore.js";
import { MemoryChain } from "./MemoryChain.js";
import { Peer } from "./Peers.js";

export type Message<T> = {
	type: Peer.MessageType<T>;
	handler(event: MessageEvent<T>): Promise<void>;
	send(peer: Peer, ctx: Bitcoin): Promise<void>;
};

export type MessageEvent<T> = {
	peer: Peer;
	data: T;
};

export type MessageExpector<T> = {
	type: Peer.MessageType<T>;
	resolvers: PromiseWithResolvers<T>;
	matcher(data: T): boolean;
};

export class Bitcoin {
	private readonly handlers: readonly Message<unknown>[];
	private readonly handlersMap: ReadonlyMap<string, Message<unknown>>;
	private readonly handlersQueueByPeer: WeakMap<Peer, { busy: boolean; calls: { (): Promise<void> }[] }>;
	private readonly expectorsByTypeByPeer: WeakMap<Peer, Map<string, Set<MessageExpector<any>>>>;

	public readonly peers = new Set<Peer>();
	public readonly seeds: readonly string[];
	public readonly magic: Buffer;
	public readonly parser: BlockParser;
	public readonly validator: BlockValidator;
	public readonly store: BlockStore;
	public readonly chain: Chain;

	constructor(params: {
		seeds: readonly string[];
		handlers: readonly Message<unknown>[];
		magic: Buffer;
		parser: BasicBlockParser;
		validator: BasicBlockValidator;
		store: MemoryBlockStore;
		chain: MemoryChain;
	}) {
		this.seeds = params.seeds;
		this.handlers = params.handlers;
		this.magic = params.magic;
		this.parser = params.parser;
		this.validator = params.validator;
		this.store = params.store;
		this.chain = params.chain;

		this.peers = new Set<Peer>();
		this.handlersMap = new Map(this.handlers.map((handler) => [handler.type.command, handler] as const));
		this.handlersQueueByPeer = new WeakMap<Peer, { busy: boolean; calls: { (): Promise<void> }[] }>();
		this.expectorsByTypeByPeer = new WeakMap<Peer, Map<string, Set<MessageExpector<any>>>>();
	}

	public async start() {
		const sendVersion = this.handlersMap.get("version");
		if (!sendVersion) {
			throw new Error(`Missing handler for 'version' command. Make sure it is registered.`);
		}

		async function* resolveTestnetPeers(seeds: readonly string[]) {
			for (const seed of seeds) {
				try {
					const peerAddresses = await dns.resolve(seed);
					for (const peerAddress of peerAddresses) {
						yield peerAddress;
					}
				} catch {}
			}
		}

		let peerCount = 0;
		for await (const host of resolveTestnetPeers(this.seeds)) {
			if (++peerCount > 1) break;
			const peer = new Peer(host, 18333, this.magic);
			this.peers.add(peer);
			peer.connect().then(async () => {
				await sendVersion.send(peer, this);
			});
		}

		while (true) {
			try {
				await this.tick();
			} catch (error) {
				console.error("UNEXPECTED ERROR:", error);
			} finally {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}
	}

	private async tick() {
		for (const peer of this.peers) {
			const expectorsByType = this.expectorsByTypeByPeer.get(peer);

			let commandQueue = this.handlersQueueByPeer.get(peer);
			if (!commandQueue) {
				this.handlersQueueByPeer.set(peer, (commandQueue = { busy: false, calls: [] }));
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

				const handler = this.handlersMap.get(message.command);
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

	public expect<T>(peer: Peer, type: Peer.MessageType<T>, matcher: (data: T) => boolean) {
		let expectorsByType = this.expectorsByTypeByPeer.get(peer);
		if (!expectorsByType) {
			this.expectorsByTypeByPeer.set(peer, (expectorsByType = new Map()));
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
}
