import { Bitcoin } from "../Bitcoin.ts";
import { GetHeaders } from "../messages/GetHeaders.ts";

export const GetHeadersHandler: Bitcoin.MessageHandler<GetHeaders> = {
	message: GetHeaders,
	handle({ peer, data }) {
		peer.log(`📚 Received getheaders (locator count: ${data.hashes.length})`);
	},
};
