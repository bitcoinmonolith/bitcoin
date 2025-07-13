import { Bitcoin } from "../Bitcoin.ts";
import { GetHeaders } from "../messages/GetHeaders.ts";

export const GetHeadersHandler: Bitcoin.MessageHandler<GetHeaders> = {
	message: GetHeaders,
	async handle({ peer, data, ctx }) {
		peer.log(`📚 Received getheaders (locator count: ${data.hashes.length})`);
	},
};
