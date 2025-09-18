import { Peer } from "~/lib/satoshi/p2p/Peer.ts";
import { VersionMessage } from "./lib/satoshi/p2p/messages/Version.ts";

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
	public readonly version: VersionMessage;

	private readonly handlers: readonly Bitcoin.MessageHandler<unknown>[];
	private readonly handlersMap: ReadonlyMap<string, Bitcoin.MessageHandler<unknown>>;

	private readonly peers = new Set<Peer>();

	constructor(params: {
		version: VersionMessage;
		handlers: readonly Bitcoin.MessageHandler<unknown>[];
	}) {
		this.version = params.version;
		this.handlers = params.handlers;
		this.peers = new Set<Peer>();
		this.handlersMap = new Map(this.handlers.map((handler) => [handler.message.command, handler] as const));
	}

	addPeer(peer: Peer) {
		if (!peer.connected) {
			throw new Error("Peer is not connected");
		}

		if (this.peers.has(peer)) {
			throw new Error("Peer is already added");
		}

		this.peers.add(peer);
		peer.listen((payload) => {
			if (payload.command === "disconnect") {
				this.peers.delete(peer);
				return;
			}
			const handler = this.handlersMap.get(payload.command);
			if (!handler) return;
			const data = handler.message.codec.decode(payload.payload);
			handler.handle({ peer, data, ctx: this });
		});
	}

	removePeer(peer: Peer) {
		this.peers.delete(peer);
	}
}
