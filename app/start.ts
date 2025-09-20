import { hexToBytes } from "@noble/hashes/utils";
import { join } from "@std/path";
import { Bitcoin } from "~/Bitcoin.ts";
import { BASE_DATA_DIR } from "~/lib/constants.ts";
import { GetHeadersHandler } from "~/lib/satoshi/p2p/handlers/GetHeadersHandler.ts";
import { InvHandler } from "~/lib/satoshi/p2p/handlers/InvHandler.ts";
import { ping, PingHandler } from "~/lib/satoshi/p2p/handlers/PingHandler.ts";
import { SendCmpctHandler } from "~/lib/satoshi/p2p/handlers/SendCmpctHandler.ts";
import { handshake, VersionHandler } from "~/lib/satoshi/p2p/handlers/VersionHandler.ts";
import { Version } from "~/lib/satoshi/p2p/messages/Version.ts";
import { Peer } from "~/lib/satoshi/p2p/Peer.ts";
import { Blockchain } from "./lib/chain/Blockchain.ts";

const NETWORK_MAGIC = hexToBytes("f9beb4d9"); // Mainnet
/* const NETWORK_MAGIC = hexToBytes("0b110907"); // Testnet
const PEER_PORT = 18333;
const DNS_SEEDS = [
	"testnet-seed.bitcoin.jonasschnelli.ch",
	"seed.tbtc.petertodd.org",
	"testnet-seed.bluematt.me",
	"testnet-seed.bitcoin.sprovoost.nl",
]; */

const NODE_NETWORK = 1n;
const NODE_WITNESS = 1n << 3n; // 0x08

const version: Version = {
	version: 70015,
	services: NODE_NETWORK | NODE_WITNESS,
	timestamp: BigInt(Math.floor(Date.now() / 1000)),
	recvServices: NODE_NETWORK | NODE_WITNESS,
	transServices: NODE_NETWORK | NODE_WITNESS,
	nonce: 987654321n,
	userAgent: "/Monolith:0.0.1-preview.1/",
	startHeight: 150000,
	relay: false,
};

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

const peer = new Peer("192.168.1.10", 8333, NETWORK_MAGIC);

await peer.connect().then(async () => {
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
	await bitcoin.blockchain.letsTestThis(bitcoin, peer);
});
