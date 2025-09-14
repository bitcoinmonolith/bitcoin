import { Bitcoin } from "~/Bitcoin.ts";
import { SendHeadersMessage } from "~/messages/SendHeaders.ts";

export const SendHeadersHandler: Bitcoin.MessageHandler<SendHeadersMessage> = {
	message: SendHeadersMessage,
	handle({ peer }) {
		peer.log(`🪪 Peer prefers headers over inv`);
		// TODO: Handle
	},
};
