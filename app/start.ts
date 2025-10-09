import { hexToBytes } from "@noble/hashes/utils";
import { join } from "@std/path";
import { Bitcoin } from "~/Bitcoin.ts";
import { Blockchain } from "~/lib/chain/Blockchain.ts";
import { BASE_DATA_DIR } from "~/lib/constants.ts";
import { GetHeadersHandler } from "~/lib/satoshi/p2p/handlers/GetHeadersHandler.ts";
import { InvHandler } from "~/lib/satoshi/p2p/handlers/InvHandler.ts";
import { ping, PingHandler } from "~/lib/satoshi/p2p/handlers/PingHandler.ts";
import { SendCmpctHandler } from "~/lib/satoshi/p2p/handlers/SendCmpctHandler.ts";
import { handshake, VersionHandler } from "~/lib/satoshi/p2p/handlers/VersionHandler.ts";
import { Version } from "~/lib/satoshi/p2p/messages/Version.ts";
import { Peer } from "~/lib/satoshi/p2p/Peer.ts";

const NODE_NETWORK = 1n;
const NODE_WITNESS = 1n << 3n; // 0x08

const BITCOIN_NETWORK_MAGIC = hexToBytes("f9beb4d9"); // Mainnet
// const TESTNET_NETWORK_MAGIC = hexToBytes("0b110907"); // Testnet

const version: Version = {
	version: 70015,
	services: NODE_NETWORK | NODE_WITNESS,
	timestamp: BigInt(Math.floor(Date.now() / 1000)),
	recvServices: NODE_NETWORK | NODE_WITNESS,
	transServices: NODE_NETWORK | NODE_WITNESS,
	nonce: 987654321n,
	userAgent: "/BitcoinMonolith:0.0.1-preview.1/",
	startHeight: 150000,
	relay: false,
};

// const LOCAL_PEERS: Peer[] = [new Peer("192.168.1.10", 8333, BITCOIN_NETWORK_MAGIC)];
const SEEDED_PEERS: Peer[] = await peersFromSeed("dnsseed.bitcoin.dashjr.org", 8333, BITCOIN_NETWORK_MAGIC);

async function peersFromSeed(seedHost: string, port: number, magic: Uint8Array): Promise<Peer[]> {
	const addrs = await Deno.resolveDns(seedHost, "A");
	return addrs.map((addr) => new Peer(addr, port, magic));
}

const bitcoin = new Bitcoin({
	version,
	blockchain: new Blockchain(join(BASE_DATA_DIR, "chain")),
	handlers: [
		VersionHandler,
		PingHandler,
		SendCmpctHandler,
		GetHeadersHandler,
		InvHandler,
	],
});

const peers = await Promise.allSettled(SEEDED_PEERS.map(async (peer) => {
	await peer.connect();
	bitcoin.addPeer(peer);
	peer.remoteHost; // domain or IP
	await handshake(peer, {
		...version,
		recvIP: peer.remoteIp,
		recvPort: peer.remotePort,
		transIP: peer.localIp,
		transPort: peer.localPort,
	});
	await ping(peer);
	return peer;
})).then((peers) => peers.filter((peer) => peer.status === "fulfilled").map((peer) => peer.value));
await bitcoin.blockchain.startPrototype(bitcoin, peers);
