import { Bitcoin } from "~/Bitcoin.ts";
import { GetHeadersMessage } from "~/messages/GetHeaders.ts";

export const GetHeadersHandler: Bitcoin.MessageHandler<GetHeadersMessage> = {
	message: GetHeadersMessage,
	handle({ peer, data }) {
		peer.log(`📚 Received getheaders (locator count: ${data.hashes.length})`);
	},
};
