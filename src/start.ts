import dns from "dns/promises";
import { BasicBlockValidator } from "~/BasicBlockValidator.js";
import { MemoryBlockStore } from "~/MemoryBlockStore.js";
import { MemoryChain } from "~/MemoryChain.js";
import { Bitcoin } from "./Bitcoin.js";
import { Peer } from "./Peers.js";
import { SendHeaders } from "./messages/SendHeaders.js";
import {
	GetHeadersHandler,
	handshake,
	InvHandler,
	ping,
	PingHandler,
	SendCmpctHandler,
	VersionHandler,
} from "./protocols.js";

const TESTNET_MAGIC = Buffer.from("0b110907", "hex");
const TESTNET_DNS_SEEDS = [
	"testnet-seed.bitcoin.jonasschnelli.ch",
	"seed.tbtc.petertodd.org",
	"testnet-seed.bluematt.me",
	"testnet-seed.bitcoin.sprovoost.nl",
];

const bitcoin = new Bitcoin({
	handlers: [VersionHandler, PingHandler, SendCmpctHandler, GetHeadersHandler, InvHandler],
	chain: new MemoryChain(),
	store: new MemoryBlockStore(),
	validator: new BasicBlockValidator(),
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
		for await (const host of resolveTestnetPeers(TESTNET_DNS_SEEDS)) {
			if (++peerCount > 1) break;
			const peer = new Peer(host, 18333, TESTNET_MAGIC);

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

await bitcoin.start();
