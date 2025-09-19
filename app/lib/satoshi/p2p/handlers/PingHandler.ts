import { randomBytes } from "@noble/hashes/utils";
import { Bitcoin } from "~/Bitcoin.ts";
import { PingMessage } from "~/lib/satoshi/p2p/messages/Ping.ts";
import { PongMessage } from "~/lib/satoshi/p2p/messages/Pong.ts";
import { Peer } from "~/lib/satoshi/p2p/Peer.ts";
import { BytesView } from "~/lib/BytesView.ts";

export const PingHandler: Bitcoin.MessageHandler<PingMessage> = {
	message: PingMessage,
	async handle({ peer, data }) {
		peer.log(`🏓 Received ping → responding with pong`);
		await peer.send(PongMessage, { nonce: data.nonce });
	},
};

export async function ping(peer: Peer): Promise<void> {
	const nonce = new BytesView(randomBytes(8)).getBigUint64(0, true);
	await peer.send(PingMessage, { nonce });
	await peer.expect(PongMessage, (pong) => pong.nonce === nonce);
	peer.log("🏓 Pong received");
}
