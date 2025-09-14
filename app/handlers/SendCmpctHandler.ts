import { Bitcoin } from "~/Bitcoin.ts";
import { SendCmpctMessage } from "~/messages/SendCmpct.ts";

export const SendCmpctHandler: Bitcoin.MessageHandler<SendCmpctMessage> = {
	message: SendCmpctMessage,
	handle({ peer, data }) {
		peer.log(`📦 Received sendcmpct → announce=${data.announce}, version=${data.version}`);
	},
};
