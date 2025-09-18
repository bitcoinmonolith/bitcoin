/// <reference lib="deno.worker" />

import { sha256 } from "@noble/hashes/sha2";
import { equals } from "@std/bytes";
import { CompactSize } from "~/lib/CompactSize.ts";

export type HeadersJobData = {
	headersBuffer_ro: SharedArrayBuffer;
	lastHashBuffer_rw: SharedArrayBuffer;
};

export type HeadersJobResult =
	| { valid: true }
	| { valid: false; error?: string };

const headerSize = 80 + 1; // 80 bytes header + 1 byte tx count
self.onmessage = (event) => {
	try {
		const { headersBuffer_ro, lastHashBuffer_rw } = event.data as HeadersJobData;
		const headers = new Uint8Array(headersBuffer_ro);
		const [count, countSize] = CompactSize.decode(headers, 0);

		if (count === 0) {
			const result: HeadersJobResult = { valid: true };
			self.postMessage(result);
			return;
		}

		const lastHash = new Uint8Array(lastHashBuffer_rw);
		for (let i = 0; i < count; i++) {
			const prevHash = headers.subarray(
				countSize + i * headerSize + 4,
				countSize + i * headerSize + 36,
			);
			if (!equals(prevHash, lastHash)) {
				const result: HeadersJobResult = {
					valid: false,
					error: `Invalid prevHash at header index ${i}`,
				};
				self.postMessage(result);
				return;
			}

			const header = headers.subarray(
				countSize + i * headerSize,
				countSize + i * headerSize + 80,
			);
			const hash = sha256(sha256(header));
			lastHash.set(hash);
		}

		const result: HeadersJobResult = { valid: true };
		self.postMessage(result);
	} catch (err) {
		const result: HeadersJobResult = {
			valid: false,
			error: (err as Error).message,
		};
		self.postMessage(result);
	}
};
