import { Bitcoin } from "../Bitcoin.ts";
import { SendCmpct } from "../messages/SendCmpct.ts";

export const SendCmpctHandler: Bitcoin.MessageHandler<SendCmpct> = {
	message: SendCmpct,
	handle({ peer, data }) {
		peer.log(`📦 Received sendcmpct → announce=${data.announce}, version=${data.version}`);
	},
};
