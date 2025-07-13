import { Validator } from "./Validator.ts";
import { Peer } from "./Peer.ts";

export declare namespace Bitcoin {
	type MessageHandler<T> = {
		message: Peer.Message<T>;
		handle(event: MessageEvent<T>): Promise<void> | void;
	};

	type MessageEvent<T> = {
		peer: Peer;
		data: T;
		ctx: Bitcoin;
	};

	type MessageExpector<T> = {
		message: Peer.Message<T>;
		resolvers: PromiseWithResolvers<T>;
		matcher(data: T): boolean;
	};
}

export class Bitcoin {
	private readonly handlers: readonly Bitcoin.MessageHandler<unknown>[];
	private readonly handlersMap: ReadonlyMap<string, Bitcoin.MessageHandler<unknown>>;
	private readonly handlersQueueByPeer: WeakMap<Peer, { busy: boolean; calls: { (): Promise<void> }[] }>;
	private readonly expectorsByTypeByPeer: WeakMap<Peer, Map<string, Set<Bitcoin.MessageExpector<unknown>>>>;

	public readonly peers = new Set<Peer>();
	public readonly validator: Validator;

	private readonly onStart: (ctx: Bitcoin) => Promise<void>;
	private readonly onTick: (ctx: Bitcoin) => Promise<void>;

	constructor(params: {
		handlers: readonly Bitcoin.MessageHandler<unknown>[];
		validator: Validator;
		onStart(ctx: Bitcoin): Promise<void> | void;
		onTick(ctx: Bitcoin): Promise<void> | void;
	}) {
		this.handlers = params.handlers;
		this.validator = params.validator;

		this.onStart = async (ctx) => await params.onStart(ctx);
		this.onTick = async (ctx) => await params.onTick(ctx);

		this.peers = new Set<Peer>();
		this.handlersMap = new Map(this.handlers.map((handler) => [handler.message.command, handler] as const));
		this.handlersQueueByPeer = new WeakMap<Peer, { busy: boolean; calls: { (): Promise<void> }[] }>();
		this.expectorsByTypeByPeer = new WeakMap<Peer, Map<string, Set<Bitcoin.MessageExpector<unknown>>>>();
	}

	public async start() {
		await this.onStart(this);

		while (true) {
			try {
				await this.onTick(this);
				this.tick();
			} catch (error) {
				console.error("UNEXPECTED ERROR:", error);
			} finally {
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}
	}

	private tick() {
		for (const peer of this.peers) {
			if (!peer.connected) {
				this.peers.delete(peer);
				continue;
			}

			const expectorsByType = this.expectorsByTypeByPeer.get(peer);

			let commandQueue = this.handlersQueueByPeer.get(peer);
			if (!commandQueue) {
				this.handlersQueueByPeer.set(peer, commandQueue = { busy: false, calls: [] });
			}

			for (const message of peer.consumeMessages()) {
				const expectors = expectorsByType?.get(message.command);
				if (expectors?.size) {
					for (const expector of expectors) {
						const data = expector.message.deserialize(message.payload);
						if (!expector.matcher(data)) continue;
						expectors.delete(expector);
						peer.log(`✅ Matched expected ${message.command}`);
						expector.resolvers.resolve(data);
					}
					continue;
				}

				const handler = this.handlersMap.get(message.command);
				if (handler) {
					const data = handler.message.deserialize(message.payload);
					commandQueue.calls.push(() => {
						peer.log(`📥 Handling ${message.command}`);
						return Promise.resolve(handler.handle({ peer, data, ctx: this }));
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

	public expect<T>(peer: Peer, message: Peer.Message<T>, matcher: (data: T) => boolean) {
		let expectorsByType = this.expectorsByTypeByPeer.get(peer);
		if (!expectorsByType) {
			this.expectorsByTypeByPeer.set(peer, expectorsByType = new Map());
		}
		let expectors = expectorsByType.get(message.command);
		if (!expectors) {
			expectorsByType.set(message.command, expectors = new Set());
		}

		const resolvers = Promise.withResolvers<T>();
		expectors.add({ resolvers, message, matcher } satisfies Bitcoin.MessageExpector<T> as never);

		peer.log(`🔭 Expecting: ${message.command}`);

		return resolvers.promise;
	}
}
