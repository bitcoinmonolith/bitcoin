import { randomBytes } from "@noble/hashes/utils";
import { Bitcoin } from "../Bitcoin.ts";
import { Ping } from "../messages/Ping.ts";
import { Pong } from "../messages/Pong.ts";
import { Peer } from "../Peers.ts";

export const PingHandler: Bitcoin.MessageHandler<Ping> = {
	message: Ping,
	async handle({ peer, data }) {
		peer.log(`🏓 Received ping → responding with pong`);
		await peer.send(Pong, { nonce: data.nonce });
	},
};

export async function ping(ctx: Bitcoin, peer: Peer) {
	const nonce = new DataView(randomBytes(8).buffer).getBigUint64(0, true);
	await peer.send(Ping, { nonce });
	await ctx.expect(peer, Pong, (pong) => pong.nonce === nonce);
	peer.log("🏓 Pong received");
}
