import { Bitcoin } from "~/Bitcoin.ts";
import { VerackMessage } from "~/messages/Verack.ts";
import { VersionMessage } from "~/messages/Version.ts";
import { Peer } from "~/lib/p2p/Peer.ts";

export const VersionHandler: Bitcoin.MessageHandler<VersionMessage> = {
	message: VersionMessage,
	async handle({ peer, data }) {
		peer.log(`🤝 Received version: v${data.version}, ua=${data.userAgent}`);
		await peer.send(VerackMessage, {});
	},
};

export async function handshake(ctx: Bitcoin, peer: Peer, version: VersionMessage) {
	await peer.send(VersionMessage, version);
	peer.log(`📗 Sent version`);
	await ctx.expect(peer, VerackMessage, () => true);
	peer.log(`✅ Handshake complete`);
}
