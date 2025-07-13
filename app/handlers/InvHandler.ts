import { bytesToHex } from "@noble/hashes/utils";
import { Bitcoin } from "../Bitcoin.ts";
import { Inv } from "../messages/Inv.ts";

export const InvHandler: Bitcoin.MessageHandler<Inv> = {
	message: Inv,
	handle({ peer, data }) {
		for (const item of data.inventory) {
			const hash = bytesToHex(item.hash);
			peer.log(`📩 Inv: ${item.type} ${hash}`);
		}
	},
};
