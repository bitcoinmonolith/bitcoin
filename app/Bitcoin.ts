import { Validator } from "./Validator.ts";
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

// deno-lint-ignore no-explicit-any
export type MessageExpector<T = any> = {
	type: Peer.MessageType<T>;
	resolvers: PromiseWithResolvers<T>;
	matcher(data: T): boolean;
};

export class Bitcoin {
	private readonly handlers: readonly Message<unknown>[];
	private readonly handlers_map: ReadonlyMap<string, Message<unknown>>;
	private readonly handlers_queue_by_peer: WeakMap<Peer, { busy: boolean; calls: { (): Promise<void> }[] }>;
	private readonly expectors_by_type_by_peer: WeakMap<Peer, Map<string, Set<MessageExpector>>>;

	public readonly peers = new Set<Peer>();
	public readonly validator: Validator;

	private readonly on_start: (ctx: Bitcoin) => Promise<void>;
	private readonly on_tick: (ctx: Bitcoin) => Promise<void>;

	constructor(params: {
		handlers: readonly Message<unknown>[];
		validator: Validator;
		on_start(ctx: Bitcoin): Promise<void>;
		on_tick(ctx: Bitcoin): Promise<void>;
	}) {
		this.handlers = params.handlers;
		this.validator = params.validator;

		this.on_start = params.on_start;
		this.on_tick = params.on_tick;

		this.peers = new Set<Peer>();
		this.handlers_map = new Map(this.handlers.map((handler) => [handler.type.command, handler] as const));
		this.handlers_queue_by_peer = new WeakMap<Peer, { busy: boolean; calls: { (): Promise<void> }[] }>();
		this.expectors_by_type_by_peer = new WeakMap<Peer, Map<string, Set<MessageExpector>>>();
	}

	public async start() {
		await this.on_start(this);

		while (true) {
			try {
				await this.on_tick(this);
				await this.tick();
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

			const expectorsByType = this.expectors_by_type_by_peer.get(peer);

			let commandQueue = this.handlers_queue_by_peer.get(peer);
			if (!commandQueue) {
				this.handlers_queue_by_peer.set(peer, commandQueue = { busy: false, calls: [] });
			}

			for (const message of peer.consume_messages()) {
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

				const handler = this.handlers_map.get(message.command);
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
		let expectorsByType = this.expectors_by_type_by_peer.get(peer);
		if (!expectorsByType) {
			this.expectors_by_type_by_peer.set(peer, expectorsByType = new Map());
		}
		let expectors = expectorsByType.get(type.command);
		if (!expectors) {
			expectorsByType.set(type.command, expectors = new Set());
		}

		const resolvers = Promise.withResolvers<T>();
		expectors.add({ resolvers, type, matcher });

		peer.log(`🔭 Expecting: ${type.command}`);

		return resolvers.promise;
	}
}
