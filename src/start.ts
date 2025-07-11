import { BasicBlockValidator } from "~/BasicBlockValidator.ts";
import { MemoryBlockStore } from "~/MemoryBlockStore.ts";
import { MemoryChain } from "~/MemoryChain.ts";
import { Bitcoin } from "./Bitcoin.ts";
import { Peer } from "./Peers.ts";
import { SendHeaders } from "./messages/SendHeaders.ts";
import {
	GetHeadersHandler,
	handshake,
	InvHandler,
	ping,
	PingHandler,
	SendCmpctHandler,
	VersionHandler,
} from "./protocols.ts";
import { hexToBytes } from "./utils.ts";

const MAINNET_MAGIC = hexToBytes("f9beb4d9");
const TESTNET_MAGIC = hexToBytes("0b110907");
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
		async function* resolvePeers(seeds: readonly string[]) {
			for (const seed of seeds) {
				try {
					const peerAddresses = await Deno.resolveDns(seed, "A");
					for (const peerAddress of peerAddresses) {
						yield peerAddress;
					}
				} catch (_) {
					// Ignore failed DNS resolution
				}
			}
		}		

		let peerCount = 0;
		for await (const host of resolvePeers(TESTNET_DNS_SEEDS)) {
			if (++peerCount > 8) break;
			const peer = new Peer(host, 18333, TESTNET_MAGIC);

			peer.connect().then(async () => {
				ctx.peers.add(peer);
				await handshake(ctx, peer);
				await ping(ctx, peer);
				await peer.send(SendHeaders, {});
			});
		}

		/* const peer = new Peer("192.168.1.10", 8333, MAINNET_MAGIC);

		peer.connect().then(async () => {
			ctx.peers.add(peer);
			await handshake(ctx, peer);
			await ping(ctx, peer);
			await peer.send(SendHeaders, {});
		}); */
	},
	async onTick(ctx) {},
});

await bitcoin.start();
