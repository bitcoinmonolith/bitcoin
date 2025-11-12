import { Peer } from "./Peer.ts";
import { PeerMessageHandler } from "./PeerMessageHandler.ts";
import { PeerSeed } from "./PeerSeed.ts";
import { getAddr } from "./handlers/GetAddrHandler.ts";
import { ping } from "./handlers/PingHandler.ts";
import { handshake } from "./handlers/VersionHandler.ts";
import { Version } from "./messages/Version.ts";

export declare namespace PeerManager {
	export type Init = {
		magic: Uint8Array;
		version: Version;
		maxConnections: number;
		seeds: PeerSeed[];
		handlers: PeerMessageHandler<unknown>[];
	};
}

type FailedPeerInfo = {
	count: number;
	lastFailed: number;
};

export class PeerManager {
	private readonly magic: Uint8Array;
	private readonly version: Version;
	private readonly maxConnections: number;
	private readonly seeds: PeerSeed[];
	private readonly handlers: Map<string, PeerMessageHandler<unknown>>;

	private readonly connectedPeers = new Map<string, Peer>(); // host:port -> Peer
	private readonly knownPeers = new Set<string>(); // host:port - discovered peer addresses
	private readonly failedPeers = new Map<string, FailedPeerInfo>(); // host:port -> failure info

	private readonly lastAddrRequest = new WeakMap<Peer, number>(); // host:port -> timestamp of last getaddr request
	private readonly lastHeartbeat = new WeakMap<Peer, number>(); // host:port -> timestamp of last heartbeat sent

	constructor(init: PeerManager.Init) {
		this.magic = init.magic;
		this.version = init.version;
		this.maxConnections = init.maxConnections;
		this.seeds = init.seeds;
		this.handlers = new Map(init.handlers.map((h) => [h.message.command, h]));
	}

	addKnownPeer(address: Peer.Address): boolean {
		// Filter out invalid ports
		if (address.port === 0 || address.port > 65535) return false;

		// Filter out invalid addresses
		if (!this.isValidPeerAddress(address.host)) return false;

		const key = `${address.host}:${address.port}`;

		// Check if already known
		if (this.knownPeers.has(key)) return false;

		this.knownPeers.add(key);
		return true;
	}

	getKnownPeers(): Array<Peer.Address> {
		return Array.from(this.knownPeers).map((key) => {
			const [host, port] = key.split(":");
			return { host: host!, port: parseInt(port!) };
		});
	}

	peers(): Iterable<Peer> {
		return this.connectedPeers.values();
	}

	randomPeer(): Peer | undefined {
		if (this.connectedPeers.size === 0) return undefined;
		return this.connectedPeers.values().drop(Math.floor(Math.random() * this.connectedPeers.size)).next().value;
	}

	disconnectAll(): void {
		for (const peer of this.connectedPeers.values()) {
			peer.disconnect();
		}
	}

	async broadcast<T>(message: Peer.Message<T>, data: T): Promise<void> {
		const promises = this.connectedPeers.values().map((peer) =>
			peer.send(message, data).catch((e) => {
				peer.logError("Failed to broadcast:", e);
			})
		);
		await Promise.allSettled(promises);
	}

	async maintainConnections(): Promise<void> {
		for (const peer of this.connectedPeers.values()) {
			const lastHeartbeat = this.lastHeartbeat.get(peer) || 0;
			const now = Date.now();
			const heartbeatInterval = 2 * 60 * 1000; // 2 minutes

			if (now - lastHeartbeat > heartbeatInterval) {
				peer.log("💓 Sending heartbeat ping");
				try {
					await ping(peer);
					this.lastHeartbeat.set(peer, now);
				} catch (e) {
					peer.logError("💓 Heartbeat ping failed:", e);
					peer.disconnect();
				}
			}
		}

		if (this.connectedPeers.size >= this.maxConnections) return;

		const needed = this.maxConnections - this.connectedPeers.size;
		console.log(`Need ${needed} more peers to reach target of ${this.maxConnections}`);

		const now = Date.now();
		const failedPeerRetryTime = 5 * 60 * 1000; // 5 minutes
		for (const [key, info] of this.failedPeers) {
			if (now - info.lastFailed > failedPeerRetryTime) {
				this.failedPeers.delete(key);
			}
		}

		const connectedAddrs = new Set(this.connectedPeers.keys());

		const failedAddrsSet = new Set(this.failedPeers.keys());
		const unavailableAddrs = failedAddrsSet.union(connectedAddrs);
		const availableAddrs = this.knownPeers.difference(unavailableAddrs);

		console.log(
			`Peer stats: known=${this.knownPeers.size}, failed=${this.failedPeers.size}, connected=${this.connectedPeers.size}, available=${availableAddrs.size}`,
		);

		if (availableAddrs.size > 0) {
			const addresses = availableAddrs.values().map((key) => {
				const [host, port] = key.split(":") as [string, string];
				return { host, port: parseInt(port) };
			});

			const addressesToTry = addresses.take(needed);
			const results = await Promise.allSettled(addressesToTry.map((address) => this.connectPeer(address)));

			const successful = results.filter((r) => r.status === "fulfilled" && r.value !== null).length;
			if (successful > 0) {
				console.log(
					`Successfully connected to ${successful} peers, now have ${this.connectedPeers.size}/${this.maxConnections} peers`,
				);
			}

			if (this.connectedPeers.size >= this.maxConnections) {
				console.log(`Reached target of ${this.maxConnections} connections`);
			}
		}

		// If we ran out of available addresses, request more from connected peers
		if (
			availableAddrs.size === 0 &&
			this.connectedPeers.size > 0 &&
			this.connectedPeers.size < this.maxConnections
		) {
			await this.requestPeerAddresses();
		}

		// If still need more, discover from DNS seeds
		if (this.connectedPeers.size < this.maxConnections && availableAddrs.size === 0) {
			for (const seed of this.seeds) {
				if (this.connectedPeers.size >= this.maxConnections) break;
				await this.discoverFromDNS(seed, needed);
			}
		}
	}

	private async connectPeer(address: Peer.Address): Promise<Peer | null> {
		const key = `${address.host}:${address.port}`;
		const peer = new Peer(address, this.magic);
		peer.onDisconnect((reason) => {
			const key = `${peer.remoteHost}:${peer.remotePort}`;
			this.connectedPeers.delete(key);

			const reasonType = reason.type;

			if (reasonType !== "manual") {
				peer.logWarn(`Disconnected: ${reasonType}`);
				const existing = this.failedPeers.get(key);
				if (existing) {
					existing.count++;
					existing.lastFailed = Date.now();
				} else {
					this.failedPeers.set(key, { count: 1, lastFailed: Date.now() });
				}
			}
		});

		peer.listen((msg) => {
			this.lastHeartbeat.set(peer, Date.now());
			const handler = this.handlers.get(msg.command);
			if (!handler) return;
			handler.handle({ peer, data: handler.message.codec.decode(msg.payload), ctx: { peerManager: this } });
		});

		try {
			await peer.connect();
			await handshake(peer, {
				...this.version,
				recvIP: peer.remoteIp,
				recvPort: peer.remotePort,
				transIP: peer.localIp,
				transPort: peer.localPort,
			});

			this.connectedPeers.set(key, peer);
			this.failedPeers.delete(key);

			if (!this.lastAddrRequest.has(peer)) {
				this.lastAddrRequest.set(peer, Date.now());
				const addrs = await getAddr(peer);

				const now = Date.now();
				const maxAge = 24 * 60 * 60 * 1000;
				let added = 0;
				let stale = 0;
				let rejected = 0;

				for (const addr of addrs.addresses) {
					// Filter out stale addresses
					if (now - addr.timestamp > maxAge) {
						stale++;
						continue;
					}

					if (this.addKnownPeer(addr)) {
						added++;
					} else {
						rejected++;
					}
				}

				peer.log(
					`📬 First connect: ${addrs.addresses.length} addresses: ${added} added, ${stale} stale, ${rejected} rejected`,
				);
			}

			peer.log("Connected and handshaked");
			return peer;
		} catch (e) {
			const existing = this.failedPeers.get(key);
			if (existing) {
				existing.count++;
				existing.lastFailed = Date.now();
			} else {
				this.failedPeers.set(key, { count: 1, lastFailed: Date.now() });
			}
			peer.logError("Failed to connect:", e);
			return null;
		}
	}

	private isValidPeerAddress(host: string): boolean {
		// Filter out Tor onion addresses (.onion)
		if (host.endsWith(".onion")) return false;

		// Filter out invalid/incomplete addresses
		if (!host || host.length < 7) return false;

		// IPv4 validation (e.g., "192.168.1.1")
		const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
		if (ipv4Regex.test(host)) {
			// Validate each octet is 0-255
			const octets = host.split(".").map(Number);
			return octets.every((octet) => octet >= 0 && octet <= 255);
		}

		// IPv6 validation - must have at least 2 colons and proper format
		// Full format: 8 groups of 4 hex digits separated by colons
		// Compressed format: consecutive zeros can be replaced with ::
		if (host.includes(":")) {
			// Must have at least 2 colons for valid IPv6
			const colonCount = (host.match(/:/g) || []).length;
			if (colonCount < 2) return false;

			// Check for valid IPv6 pattern
			// Allow :: for compressed zeros, but only once
			const doubleColonCount = (host.match(/::/g) || []).length;
			if (doubleColonCount > 1) return false;

			// Split and validate groups
			const parts = host.split("::");
			if (parts.length > 2) return false;

			for (const part of parts) {
				if (part === "") continue;
				const groups = part.split(":");
				for (const group of groups) {
					// Each group must be 1-4 hex digits
					if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return false;
				}
			}

			// If no ::, must have exactly 8 groups
			if (doubleColonCount === 0) {
				const groups = host.split(":");
				if (groups.length !== 8) return false;
			}

			return true;
		}

		// Reject anything else (partial IPs, invalid formats, etc.)
		return false;
	}

	private async discoverFromDNS(seed: PeerSeed, maxPeers = 10): Promise<void> {
		try {
			const addrs = await Deno.resolveDns(seed.seedHost, "A");
			const addresses = addrs.slice(0, maxPeers).map((addr) => {
				const key = `${addr}:${seed.peerPort}`;
				this.knownPeers.add(key);
				return { host: addr, port: seed.peerPort };
			});

			// Try each discovered address one at a time
			for (const address of addresses) {
				if (this.connectedPeers.size >= this.maxConnections) break;
				await this.connectPeer(address);
			}
		} catch (e) {
			console.error(`Failed to discover peers from ${seed.seedHost}:`, e);
		}
	}

	private async requestPeerAddresses(): Promise<void> {
		const now = Date.now();
		const minInterval = 2 * 60 * 1000;

		const peer: Peer | undefined = this.connectedPeers.values()
			.filter((peer) => now - (this.lastAddrRequest.get(peer) || 0) > minInterval)
			.next().value;

		if (!peer) {
			console.log("No peers available to request addresses from (all recently asked)");
			return;
		}
		this.lastAddrRequest.set(peer, now);

		const addrs = await getAddr(peer);
		const maxAge = 24 * 60 * 60 * 1000;

		let added = 0;
		let stale = 0;
		let rejected = 0;

		for (const addr of addrs.addresses) {
			if (now - addr.timestamp > maxAge) {
				stale++;
				continue;
			}

			if (this.addKnownPeer(addr)) {
				added++;
			} else {
				rejected++;
			}
		}

		peer.log(
			`📬 Received ${addrs.addresses.length} addresses: ${added} added, ${stale} stale, ${rejected} rejected`,
		);
	}
}
