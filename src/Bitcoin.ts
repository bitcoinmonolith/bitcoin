import { BasicBlockValidator } from "./BasicBlockValidator.ts";
import { BlockStore, BlockValidator, Chain } from "./Blocks.ts";
import { MemoryBlockStore } from "./MemoryBlockStore.ts";
import { MemoryChain } from "./MemoryChain.ts";
import { Peer } from "./Peers.ts";

export type Message<T> = {
	type: Peer.MessageType<T>;
	handler(event: MessageEvent<T>): Promise<void>;
};

export type MessageEvent<T> = {
	peer: Peer;
	data: T;
	ctx: Bitcoin;
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
	public readonly validator: BlockValidator;
	public readonly store: BlockStore;
	public readonly chain: Chain;

	private readonly onStart: (ctx: Bitcoin) => Promise<void>;
	private readonly onTick: (ctx: Bitcoin) => Promise<void>;

	constructor(params: {
		handlers: readonly Message<unknown>[];
		validator: BasicBlockValidator;
		store: MemoryBlockStore;
		chain: MemoryChain;
		onStart(ctx: Bitcoin): Promise<void>;
		onTick(ctx: Bitcoin): Promise<void>;
	}) {
		this.handlers = params.handlers;
		this.validator = params.validator;
		this.store = params.store;
		this.chain = params.chain;

		this.onStart = params.onStart;
		this.onTick = params.onTick;

		this.peers = new Set<Peer>();
		this.handlersMap = new Map(this.handlers.map((handler) => [handler.type.command, handler] as const));
		this.handlersQueueByPeer = new WeakMap<Peer, { busy: boolean; calls: { (): Promise<void> }[] }>();
		this.expectorsByTypeByPeer = new WeakMap<Peer, Map<string, Set<MessageExpector<any>>>>();
	}

	public async start() {
		await this.onStart(this);

		while (true) {
			try {
				await this.onTick(this);
				await this.tick();
			} catch (error) {
				console.error("UNEXPECTED ERROR:", error);
			} finally {
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}
	}

	private async tick() {
		for (const peer of this.peers) {
			if (!peer.connected) {
				this.peers.delete(peer);
				continue;
			}

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
						return handler.handler({ peer, data, ctx: this });
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
