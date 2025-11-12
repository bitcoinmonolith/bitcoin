/// <reference lib="deno.worker" />

import { Struct } from "@nomadshiba/codec";
import { bytes32 } from "~/lib/primitives/Bytes32.ts";
import { u24 } from "~/lib/primitives/U24.ts";

export const TxEntry = new Struct({
	txId: bytes32,
	wtxId: bytes32,
	offset: u24,
});

export type BlocksJobData = {
	blockBuffers: Uint8Array<SharedArrayBuffer>[];
};

export type BlocksJobResult =
	| { valid: true; txEntries?: Uint8Array<SharedArrayBuffer> }
	| { valid: false; error?: string };

self.onmessage = (event) => {
};
