import { Bitcoin } from "~/Bitcoin.ts";
import { InvMessage } from "~/lib/satoshi/p2p/messages/Inv.ts";
import { humanize } from "../../../logging/human.ts";

export const InvHandler: Bitcoin.MessageHandler<InvMessage> = {
	message: InvMessage,
	handle({ peer, data }) {
		for (const item of data.inventory) {
			peer.log(`📩 Inv: ${item.type} ${humanize(item.hash)}`);
		}
	},
};
