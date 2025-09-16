import { Bitcoin } from "~/Bitcoin.ts";
import { VerackMessage } from "~/lib/p2p/messages/Verack.ts";
import { VersionMessage } from "~/lib/p2p/messages/Version.ts";
import { Peer } from "~/lib/p2p/Peer.ts";

export const VersionHandler: Bitcoin.MessageHandler<VersionMessage> = {
	message: VersionMessage,
	async handle({ peer, data }) {
		peer.log(`🤝 Received version: v${data.version}, ua=${data.userAgent}`);
		await peer.send(VerackMessage, {});
	},
};

export async function handshake(peer: Peer, version: VersionMessage) {
	await peer.send(VersionMessage, version);
	peer.log(`📗 Sent version`);
	await peer.expect(VerackMessage, () => true);
	peer.log(`✅ Handshake complete`);
}
