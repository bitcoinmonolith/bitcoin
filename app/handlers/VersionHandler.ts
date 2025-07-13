import { Bitcoin } from "../Bitcoin.ts";
import { Verack } from "../messages/Verack.ts";
import { Version } from "../messages/Version.ts";
import { Peer } from "../Peer.ts";

export const VersionHandler: Bitcoin.MessageHandler<Version> = {
	message: Version,
	async handle({ peer, data }) {
		peer.log(`🤝 Received version: v${data.version}, ua=${data.userAgent}`);
		await peer.send(Verack, {});
	},
};

export async function handshake(ctx: Bitcoin, peer: Peer, version: Version) {
	await peer.send(Version, version);
	peer.log(`📗 Sent version`);
	await ctx.expect(peer, Verack, () => true);
	peer.log(`✅ Handshake complete`);
}
