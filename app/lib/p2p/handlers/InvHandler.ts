import { bytesToHex } from "@noble/hashes/utils";
import { Bitcoin } from "~/Bitcoin.ts";
import { InvMessage } from "~/lib/p2p/messages/Inv.ts";

export const InvHandler: Bitcoin.MessageHandler<InvMessage> = {
	message: InvMessage,
	handle({ peer, data }) {
		for (const item of data.inventory) {
			const hash = bytesToHex(item.hash);
			peer.log(`📩 Inv: ${item.type} ${hash}`);
		}
	},
};
