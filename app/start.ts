import { hexToBytes } from "@noble/hashes/utils";
import { Bitcoin } from "./Bitcoin.ts";
import { Peer } from "./Peers.ts";
import { Validator } from "./Validator.ts";
import { GetHeadersHandler } from "./handlers/GetHeadersHandler.ts";
import { InvHandler } from "./handlers/InvHandler.ts";
import { ping, PingHandler } from "./handlers/PingHandler.ts";
import { SendCmpctHandler } from "./handlers/SendCmpctHandler.ts";
import { handshake, VersionHandler } from "./handlers/VersionHandler.ts";
import { Block } from "./messages/Block.ts";
import { GetData } from "./messages/GetData.ts";
import { SendHeaders } from "./messages/SendHeaders.ts";
import { Version } from "./messages/Version.ts";
import { bytes_equal } from "./utils/bytes.ts";

const NETWORK_MAGIC = hexToBytes("f9beb4d9"); // Mainnet
// const NETWORK_MAGIC = hexToBytes("0b110907"); // Testnet
const PEER_PORT = 18333;
const DNS_SEEDS = [
	"testnet-seed.bitcoin.jonasschnelli.ch",
	"seed.tbtc.petertodd.org",
	"testnet-seed.bluematt.me",
	"testnet-seed.bitcoin.sprovoost.nl",
];

const bitcoin = new Bitcoin({
	handlers: [VersionHandler, PingHandler, SendCmpctHandler, GetHeadersHandler, InvHandler],
	validator: new Validator(),
	async on_start(ctx) {
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

		/* let peer_count = 0;
		for await (const host of resolvePeers(DNS_SEEDS)) {
			if (++peer_count > 8) break;
			const peer = new Peer(host, PEER_PORT, NETWORK_MAGIC);

			const connected_promise = peer.connect().then(() => true).catch(() => false);
			connected_promise.then(async (connected) => {
				if (!connected) return;
				ctx.peers.add(peer);
				await handshake(ctx, peer);
				await ping(ctx, peer);
				await peer.send(SendHeaders, {});
			});
		} */

		const peer = new Peer("192.168.1.10", 8333, NETWORK_MAGIC);

		const version: Version = {
			version: 70015,
			services: 1n,
			timestamp: BigInt(Math.floor(Date.now() / 1000)),
			recvServices: 1n,
			recvPort: 18333,
			transServices: 1n,
			transPort: 18333,
			nonce: 987654321n,
			userAgent: "/Satoshi:BitcoinClient:0.0.1-alpha.1/",
			startHeight: 150000,
			relay: false,
		};

		const genesis = hexToBytes("000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f").reverse();
		peer.connect().then(async () => {
			ctx.peers.add(peer);
			await handshake(ctx, peer, version);
			await ping(ctx, peer);
			await peer.send(SendHeaders, {});

			await peer.send(GetData, {
				inventory: [{
					type: "BLOCK",
					hash: genesis,
				}],
			});
			console.log(
				await ctx.expect(
					peer,
					Block,
					(block) => bytes_equal(block.header.hash.reverse(), genesis),
				),
			);
		});
	},
	async on_tick() {},
});

await bitcoin.start();
