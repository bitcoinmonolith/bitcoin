import { BasicBlockParser } from "~/BasicBlockParser.js";
import { BasicBlockValidator } from "~/BasicBlockValidator.js";
import { MemoryBlockStore } from "~/MemoryBlockStore.js";
import { MemoryChain } from "~/MemoryChain.js";
import { Peer } from "~/Peers.js";
import { Bitcoin, Message } from "./Bitcoin.js";
import { Verack } from "./messages/Verack.js";
import { Version } from "./messages/Version.js";

const parser = new BasicBlockParser();
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

const VersionHandler: Message<Version> = {
	type: Version,
	async handler({ peer, data }) {
		peer.log(`🤝 Received version: v${data.version}, ua=${data.userAgent}`);
		await peer.send(Verack, {});
	},
	async send(peer: Peer, ctx: Bitcoin) {
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
	},
};

const bitcoin = new Bitcoin({
	seeds: TESTNET_DNS_SEEDS,
	magic: TESTNET_MAGIC,
	handlers: [VersionHandler],
	chain,
	parser,
	store,
	validator,
});
await bitcoin.start();
