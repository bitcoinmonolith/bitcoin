import { Bitcoin } from "../Bitcoin.ts";
import { SendHeaders } from "../messages/SendHeaders.ts";

export const SendHeadersHandler: Bitcoin.MessageHandler<SendHeaders> = {
	message: SendHeaders,
	handle({ peer }) {
		peer.log(`🪪 Peer prefers headers over inv`);
		// TODO: Handle
	},
};
