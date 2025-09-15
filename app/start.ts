import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { equals } from "@std/bytes";
import { Bitcoin } from "~/Bitcoin.ts";
import { GetHeadersHandler } from "~/handlers/GetHeadersHandler.ts";
import { InvHandler } from "~/handlers/InvHandler.ts";
import { ping, PingHandler } from "~/handlers/PingHandler.ts";
import { SendCmpctHandler } from "~/handlers/SendCmpctHandler.ts";
import { handshake, VersionHandler } from "~/handlers/VersionHandler.ts";
import { Peer } from "~/lib/p2p/Peer.ts";
import { BlockMessage } from "~/messages/Block.ts";
import { GetDataMessage } from "~/messages/GetData.ts";
import { SendHeadersMessage } from "~/messages/SendHeaders.ts";
import { VersionMessage } from "~/messages/Version.ts";
import { Tx } from "./lib/primitives/Tx.ts";
import { computeSatoshiMerkleRoot } from "./lib/satoshi/merkle.ts";

const NETWORK_MAGIC = hexToBytes("f9beb4d9"); // Mainnet
/* const NETWORK_MAGIC = hexToBytes("0b110907"); // Testnet
const PEER_PORT = 18333;
const DNS_SEEDS = [
	"testnet-seed.bitcoin.jonasschnelli.ch",
	"seed.tbtc.petertodd.org",
	"testnet-seed.bluematt.me",
	"testnet-seed.bitcoin.sprovoost.nl",
]; */

function recursiveToHumanReadable(value: unknown): unknown {
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

const bitcoin = new class extends Bitcoin {
	constructor() {
		super({
			handlers: [VersionHandler, PingHandler, SendCmpctHandler, GetHeadersHandler, InvHandler],
		});
	}

	public override async start(): Promise<void> {
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

		const modernBlock = hexToBytes("00000000000000000001ee4aa122a84c1edba54383a46e61a1360f7651db78b5").reverse();
		const genesisBlock = hexToBytes("000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f").reverse();
		const testBlock = modernBlock;
		peer.connect().then(async () => {
			this.peers.add(peer);
			await handshake(this, peer, version);
			await ping(this, peer);
			await peer.send(SendHeadersMessage, {});

			await peer.send(GetDataMessage, {
				inventory: [{
					type: "WITNESS_BLOCK",
					hash: testBlock,
				}],
			});
			const block = await this.expect(peer, BlockMessage, (block) => equals(block.header.hash, testBlock));
			console.log("Block:", recursiveToHumanReadable(block.header));
			const computedMerkleRoot = computeSatoshiMerkleRoot(
				block.txs.map((tx) => sha256(sha256(Tx.encode({ ...tx, witness: false })))),
			);
			console.log("Merkle Root:", bytesToHex(block.header.merkleRoot));
			console.log("Computed:", bytesToHex(computedMerkleRoot));
			if (!equals(block.header.merkleRoot, computedMerkleRoot)) {
				throw new Error("Invalid merkle root");
			}
			for (const tx of block.txs) {
				// const wtxid = bytesToHex(sha256(sha256(Tx.encode({ ...tx, witness: true }))).reverse());
				const txId = bytesToHex(sha256(sha256(Tx.encode({ ...tx, witness: false }))).reverse());
				console.log(`Tx[${txId}]:`, recursiveToHumanReadable(tx));
			}
		});

		await super.start();
	}
}();

await bitcoin.start();
