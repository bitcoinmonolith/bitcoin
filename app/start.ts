import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { equals } from "@std/bytes";
import { Bitcoin } from "~/Bitcoin.ts";
import { GetHeadersHandler } from "~/lib/p2p/handlers/GetHeadersHandler.ts";
import { InvHandler } from "~/lib/p2p/handlers/InvHandler.ts";
import { ping, PingHandler } from "~/lib/p2p/handlers/PingHandler.ts";
import { SendCmpctHandler } from "~/lib/p2p/handlers/SendCmpctHandler.ts";
import { handshake, VersionHandler } from "~/lib/p2p/handlers/VersionHandler.ts";
import { BlockMessage } from "~/lib/p2p/messages/Block.ts";
import { GetDataMessage } from "~/lib/p2p/messages/GetData.ts";
import { VersionMessage } from "~/lib/p2p/messages/Version.ts";
import { Peer } from "~/lib/p2p/Peer.ts";
import { GENESIS_BLOCK_HASH } from "./lib/constants.ts";
import { GetHeadersMessage } from "./lib/p2p/messages/GetHeaders.ts";
import { HeadersMessage } from "./lib/p2p/messages/Headers.ts";
import { getBlockHash } from "./lib/primitives/BlockHeader.ts";
import { getTxId } from "./lib/primitives/Tx.ts";
import { computeSatoshiMerkleRoot } from "./lib/satoshi/merkle.ts";
import { saveBlock } from "./lib/storage/blocks.ts";

const NETWORK_MAGIC = hexToBytes("f9beb4d9"); // Mainnet
/* const NETWORK_MAGIC = hexToBytes("0b110907"); // Testnet
const PEER_PORT = 18333;
const DNS_SEEDS = [
	"testnet-seed.bitcoin.jonasschnelli.ch",
	"seed.tbtc.petertodd.org",
	"testnet-seed.bluematt.me",
	"testnet-seed.bitcoin.sprovoost.nl",
]; */

export function recursiveToHumanReadable(value: unknown): unknown {
	if (value instanceof Uint8Array) {
		return bytesToHex(value.toReversed());
	}

	if (typeof value === "bigint") {
		return value.toString();
	}

	if (typeof value === "number") {
		return `0x${value.toString(16)}`;
	}

	if (Array.isArray(value)) {
		return value.map(recursiveToHumanReadable);
	}

	if (value && typeof value === "object") {
		const obj: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			obj[k] = recursiveToHumanReadable(v);
		}
		return obj;
	}
	return value;
}

const bitcoin = new Bitcoin({
	handlers: [
		VersionHandler,
		PingHandler,
		SendCmpctHandler,
		GetHeadersHandler,
		InvHandler,
	],
});

const peer = new Peer("192.168.1.10", 8333, NETWORK_MAGIC);

const NODE_NETWORK = 1n;
const NODE_WITNESS = 1n << 3n; // 0x08

const version: VersionMessage = {
	version: 70015,
	services: NODE_NETWORK | NODE_WITNESS,
	timestamp: BigInt(Math.floor(Date.now() / 1000)),
	recvServices: NODE_NETWORK | NODE_WITNESS,
	recvIP: hexToBytes("00000000000000000000ffff0a000001"),
	recvPort: 18333,
	transServices: NODE_NETWORK | NODE_WITNESS,
	transIP: hexToBytes("00000000000000000000ffff0a000001"),
	transPort: 18333,
	nonce: 987654321n,
	userAgent: "/Satoshi:BitcoinClient:0.0.1-alpha.1/",
	startHeight: 150000,
	relay: false,
};

const modernBlock = hexToBytes("000000000000000000011cd4d27fc6ae94f6e436088fec3c873d6dc8d522a7e2").reverse();

let bestHeight = 0;
let bestHash = GENESIS_BLOCK_HASH;

let lastStart = 0;
async function sync(peer: Peer) {
	// step 1: ask headers
	await peer.send(GetHeadersMessage, {
		version: version.version,
		locators: [bestHash], // simple locator for now
		stopHash: new Uint8Array(32),
	});

	// step 2: receive headers
	const headersMsg = await peer.expect(
		HeadersMessage,
		(msg) => msg.headers.length === 0 || Boolean(msg.headers[0] && equals(msg.headers[0]?.prevHash, bestHash)),
	);
	const headers = headersMsg.headers;
	if (headers.length === 0) {
		console.log("caught up to peer tip");
		return;
	}
	if (bestHash === GENESIS_BLOCK_HASH) {
		await peer.send(GetDataMessage, {
			inventory: [{ type: "WITNESS_BLOCK", hash: GENESIS_BLOCK_HASH }],
		});
		const block = await peer.expect(BlockMessage, (b) => equals(getBlockHash(b.header), GENESIS_BLOCK_HASH));
		await saveBlock(0, block);
	}

	let prevHash = bestHash;
	for (const header of headers) {
		// validate header chain
		if (!equals(header.prevHash, prevHash)) {
			throw new Error("chain broken");
		}

		if (bestHeight % 100 === 0) {
			const time = performance.now() - lastStart;
			lastStart = performance.now();
			const blocksPerSecond = 100 / (time / 1000);
			console.log(`syncing... height=${bestHeight} (${blocksPerSecond.toFixed(2)} blocks/s)`);
		}

		const hash = getBlockHash(header);
		const height = ++bestHeight;
		prevHash = hash;
		bestHash = hash;

		// step 3: request block
		await peer.send(GetDataMessage, {
			inventory: [{ type: "WITNESS_BLOCK", hash }],
		});

		// step 4: receive block
		const block = await peer.expect(BlockMessage, (b) => equals(getBlockHash(b.header), hash));

		// step 5: verify merkle root
		const computedMerkle = computeSatoshiMerkleRoot(block.txs.map(getTxId));
		if (!equals(computedMerkle, block.header.merkleRoot)) {
			throw new Error("invalid merkle root");
		}

		// step 6: save block
		await saveBlock(height, block);
	}

	// step 7: loop until tip
	await sync(peer);
}

await peer.connect().then(async () => {
	bitcoin.addPeer(peer);
	await handshake(peer, version);
	await ping(peer);
	await sync(peer);
});
