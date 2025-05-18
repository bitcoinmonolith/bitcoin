import { BasicBlockValidator } from "~/BasicBlockValidator.js";
import { MemoryBlockStore } from "~/MemoryBlockStore.js";
import { MemoryChain } from "~/MemoryChain.js";
import { Bitcoin } from "./Bitcoin.js";
import { GetHeadersHandler } from "./messages/GetHeaders.js";
import { Ping, PingHandler } from "./messages/Ping.js";
import { SendCmpctHandler } from "./messages/SendCmpct.js";
import { Version, VersionHandler } from "./messages/Version.js";
import { randomBytes } from "crypto";
import { Peer } from "./Peers.js";
import { Pong } from "./messages/Pong.js";
import dns from "dns/promises";
import { SendHeaders } from "./messages/SendHeaders.js";
import { Verack } from "./messages/Verack.js";

const validator = new BasicBlockValidator();
const store = new MemoryBlockStore();
const chain = new MemoryChain();

const TESTNET_MAGIC = Buffer.from("0b110907", "hex");
const TESTNET_DNS_SEEDS = [
	"testnet-seed.bitcoin.jonasschnelli.ch",
	"seed.tbtc.petertodd.org",
	"testnet-seed.bluematt.me",
	"testnet-seed.bitcoin.sprovoost.nl",
];

const bitcoin = new Bitcoin({
	seeds: TESTNET_DNS_SEEDS,
	magic: TESTNET_MAGIC,
	handlers: [VersionHandler, PingHandler, SendCmpctHandler, GetHeadersHandler],
	chain,
	store,
	validator,
	async onStart(ctx) {
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
			if (++peerCount > 16) break;
			const peer = new Peer(host, 18333, this.magic);

			peer.connect().then(async () => {
				ctx.peers.add(peer);
				await handshake(ctx, peer);
				await ping(ctx, peer);
				await peer.send(SendHeaders, {});
			});
		}
	},
	async onTick(ctx) {},
});

export async function ping(ctx: Bitcoin, peer: Peer) {
	const nonce = randomBytes(8).readBigUInt64LE(0);
	await peer.send(Ping, { nonce });
	await ctx.expect(peer, Pong, (pong) => pong.nonce === nonce);
	peer.log("🏓 Pong received");
}

export async function handshake(ctx: Bitcoin, peer: Peer) {
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
	await ctx.expect(peer, Verack, () => true);
	peer.log(`✅ Handshake complete`);
}

await bitcoin.start();
