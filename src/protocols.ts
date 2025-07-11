import { Bitcoin, Message } from "./Bitcoin.ts";
import { Ping } from "./messages/Ping.ts";
import { Pong } from "./messages/Pong.ts";
import { SendHeaders } from "./messages/SendHeaders.ts";
import { Peer } from "./Peers.ts";
import { Version } from "./messages/Version.ts";
import { Verack } from "./messages/Verack.ts";
import { SendCmpct } from "./messages/SendCmpct.ts";
import { GetHeaders } from "./messages/GetHeaders.ts";
import { Headers } from "./messages/Headers.ts";
import { Inv } from "./messages/Inv.ts";
import { randomBytes } from "@noble/hashes/utils";
import { bytesToHex, readUInt64LE } from "./utils.ts";

export const SendHeadersHandler: Message<SendHeaders> = {
	type: SendHeaders,
	async handler({ peer }) {
		peer.log(`🪪 Peer prefers headers over inv`);
	},
};

export const PingHandler: Message<Ping> = {
	type: Ping,
	async handler({ peer, data }) {
		peer.log(`🏓 Received ping → responding with pong`);
		await peer.send(Pong, { nonce: data.nonce });
	},
};
export async function ping(ctx: Bitcoin, peer: Peer) {
	const nonce = readUInt64LE(randomBytes(8), 0);
	await peer.send(Ping, { nonce });
	await ctx.expect(peer, Pong, (pong) => pong.nonce === nonce);
	peer.log("🏓 Pong received");
}

export const VersionHandler: Message<Version> = {
	type: Version,
	async handler({ peer, data }) {
		peer.log(`🤝 Received version: v${data.version}, ua=${data.userAgent}`);
		await peer.send(Verack, {});
	},
};
export async function handshake(ctx: Bitcoin, peer: Peer) {
	const versionData: Version = {
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

	await peer.send(Version, versionData);
	peer.log(`📗 Sent version`);
	await ctx.expect(peer, Verack, () => true);
	peer.log(`✅ Handshake complete`);
}

export const SendCmpctHandler: Message<SendCmpct> = {
	type: SendCmpct,
	async handler({ peer, data }) {
		peer.log(`📦 Received sendcmpct → announce=${data.announce}, version=${data.version}`);
	},
};

export const GetHeadersHandler: Message<GetHeaders> = {
	type: GetHeaders,
	async handler({ peer, data, ctx }) {
		const { chain } = ctx;

		peer.log(`📚 Received getheaders (locator count: ${data.hashes.length})`);

		let known: string | undefined;

		// 1. Find first known hash
		for (const locator of data.hashes) {
			const hex = bytesToHex(locator);
			if (chain.has(hex)) {
				known = hex;
				break;
			}
		}

		if (!known) {
			peer.logWarn("🤷 No common ancestor found for getheaders");
			return;
		}

		// 2. Walk forward from the known block
		const headers: Uint8Array[] = [];
		let next = chain.nextBlockHeader(known);

		while (next && headers.length < 2000) {
			headers.push(next.raw);
			if (next.hash === bytesToHex(data.stopHash)) break;
			next = chain.nextBlockHeader(next.hash);
		}

		peer.log(`📦 Sending ${headers.length} headers`);
		await peer.send(Headers, { headers });
	},
};

export const InvHandler: Message<Inv> = {
	type: Inv,
	async handler({ peer, data }) {
		for (const item of data.inventory) {
			const typeName = item.type === 1 ? "tx" : item.type === 2 ? "block" : `type-${item.type}`;
			const hash = bytesToHex(item.hash);
			peer.log(`📩 Inv: ${typeName} ${hash}`);
		}
	},
};
