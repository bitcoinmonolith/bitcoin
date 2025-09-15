import { Peer } from "~/lib/p2p/Peer.ts";
import { PeerMessage } from "~/lib/p2p/PeerMessage.ts";

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
		matcher(data: T, raw: Uint8Array): boolean;
	};
}

export class Bitcoin {
	private readonly handlers: readonly Bitcoin.MessageHandler<unknown>[];
	private readonly handlersMap: ReadonlyMap<string, Bitcoin.MessageHandler<unknown>>;
	private readonly handlersQueueByPeer: WeakMap<Peer, { busy: boolean; calls: { (): Promise<void> }[] }>;
	private readonly expectorsByTypeByPeer: WeakMap<Peer, Map<string, Set<Bitcoin.MessageExpector<unknown>>>>;

	public readonly peers = new Set<Peer>();

	constructor(params: {
		handlers: readonly Bitcoin.MessageHandler<unknown>[];
	}) {
		this.handlers = params.handlers;

		this.peers = new Set<Peer>();
		this.handlersMap = new Map(this.handlers.map((handler) => [handler.message.command, handler] as const));
		this.handlersQueueByPeer = new WeakMap<Peer, { busy: boolean; calls: { (): Promise<void> }[] }>();
		this.expectorsByTypeByPeer = new WeakMap<Peer, Map<string, Set<Bitcoin.MessageExpector<unknown>>>>();
	}

	public async start() {
		while (true) {
			try {
				this.tick();
			} catch (error) {
				console.error("UNEXPECTED ERROR:", error);
			} finally {
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}
	}

	// deno-lint-ignore require-await
	private async tick() {
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
						const data = expector.message.codec.decode(message.payload);
						if (!expector.matcher(data, message.payload)) continue;
						expectors.delete(expector);
						peer.log(`✅ Matched expected ${message.command}`);
						expector.resolvers.resolve(data);
					}
					continue;
				}

				const handler = this.handlersMap.get(message.command);
				if (handler) {
					const data = handler.message.codec.decode(message.payload);
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

	public expect<T>(peer: Peer, message: PeerMessage<T>, matcher: (data: T, raw: Uint8Array) => boolean) {
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
