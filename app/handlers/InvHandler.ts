import { bytesToHex } from "@noble/hashes/utils";
import { Bitcoin } from "../Bitcoin.ts";
import { Inv } from "../messages/Inv.ts";

export const InvHandler: Bitcoin.MessageHandler<Inv> = {
	message: Inv,
	async handle({ peer, data }) {
		for (const item of data.inventory) {
			const typeName = item.type === 1 ? "tx" : item.type === 2 ? "block" : `type-${item.type}`;
			const hash = bytesToHex(item.hash);
			peer.log(`📩 Inv: ${typeName} ${hash}`);
		}
	},
};
