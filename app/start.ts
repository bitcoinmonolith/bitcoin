import { hexToBytes } from "@noble/hashes/utils";
import { join } from "@std/path";
import { BASE_DATA_DIR } from "~/lib/constants.ts";
import { Version } from "~/lib/satoshi/p2p/messages/Version.ts";
import { ChainManager } from "./lib/chain/ChainManager.ts";
import { PeerManager } from "./lib/satoshi/p2p/PeerManager.ts";
import { GetAddrHandler } from "./lib/satoshi/p2p/handlers/GetAddrHandler.ts";
import { GetHeadersHandler } from "./lib/satoshi/p2p/handlers/GetHeadersHandler.ts";
import { InvHandler } from "./lib/satoshi/p2p/handlers/InvHandler.ts";
import { PingHandler } from "./lib/satoshi/p2p/handlers/PingHandler.ts";
import { SendCmpctHandler } from "./lib/satoshi/p2p/handlers/SendCmpctHandler.ts";
import { SendHeadersHandler } from "./lib/satoshi/p2p/handlers/SendHeadersHandler.ts";
import { VersionHandler } from "./lib/satoshi/p2p/handlers/VersionHandler.ts";

const BITCOIN_NETWORK_MAGIC = hexToBytes("f9beb4d9");

const SERVICES = {
	NETWORK: 0x01n,
	BLOOM: 0x04n,
	WITNESS: 0x08n,
	COMPACT_BLOCKS: 0x20n,
	NETWORK_LIMITED: 0x10n,
} as const;

const version: Version = {
	version: 70015,
	services: SERVICES.WITNESS,
	timestamp: BigInt(Math.floor(Date.now() / 1000)),
	recvServices: SERVICES.WITNESS,
	transServices: SERVICES.WITNESS,
	nonce: 987654321n,
	userAgent: "/BitcoinMonolith:0.0.1-preview.1/",
	startHeight: 0,
	relay: false,
};

const peerManager = new PeerManager({
	magic: BITCOIN_NETWORK_MAGIC,
	version,
	maxConnections: 1,
	seeds: [/* { seedHost: "dnsseed.bitcoin.dashjr.org", peerPort: 8333 } */],
	handlers: [
		VersionHandler,
		PingHandler,
		InvHandler,
		GetHeadersHandler,
		SendHeadersHandler,
		SendCmpctHandler,
		GetAddrHandler,
	],
});

const chainManager = new ChainManager(join(BASE_DATA_DIR, "chain"), peerManager);

peerManager.addKnownPeer({ host: "192.168.1.10", port: 8333 });

await chainManager.init();
while (true) {
	await peerManager.maintainConnections();
	await chainManager.syncHeadersFromPeers(peerManager);
	await chainManager.downloadBlocks(10);

	// TODO: instead of chainManager doing everything, it can only have the header data and chain?
	// TODO: then we can have other stuff in here doing stuff based on its state and stuff.
	// TODO: also maybe dont prefix these with Chain, instead we can use HeaderManager or something?
	// TODO: also fix the issue with block download. lets make it run correctly first. then we can make it better.
	// TODO: height index doesnt have to be sequential right? we can have gaps.
	// TODO: how do we store blocks with gaps? current chunk system assumes sequential.
	// TODO: StoreBlock.fromBlock() shouldnt be there, its not just converting formats, it has pointer logic.
	// TODO: then the whole shit needs a refactor. mostly the `chain/` side
	// TODO: just make it make more sense as a codebase.
}
