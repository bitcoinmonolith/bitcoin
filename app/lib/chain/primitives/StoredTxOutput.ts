// TODO: AI made this, verify it is correct, im gonna sleep now

import { Codec } from "@nomadshiba/codec";

/**
 * StoredTxOutput binary layout
 *
 * ── 7-byte header (56 bits total, little-endian) ──
 * bits  0–50 : value   (51-bit unsigned satoshis)
 * bit   51   : spent   (1-bit flag)
 * bits 52–55 : typeId  (4-bit script type, range 0..15)
 *
 * typeId mapping:
 *   0 = pointer (chunkId:u16, offset:u32)
 *   1 = raw     (scriptPubKey, arbitrary length)
 *   2 = p2pkh   (20-byte hash160)
 *   3 = p2sh    (20-byte hash160)
 *   4 = p2wpkh  (20-byte hash160)
 *   5 = p2wsh   (32-byte sha256)
 *   6 = p2tr    (32-byte xonly pubkey)
 *   7–15 = reserved
 *
 * ── payload (variable) ──
 * if typeId = 0: 6 bytes [chunkId:u16, offset:u32]
 * if typeId = 1: raw scriptPubKey (arbitrary length)
 * if typeId = 2–6: fixed-length data as listed above
 *
 * userland type is always either:
 *   { value, spent, scriptType: "pointer", chunkId, offset }
 *   { value, spent, scriptType: "script", scriptPubKey }
 */

/*
	Using pointer also requires indexing the addresses somewhere else.
	But assuming we will support electrum endpoints, we will have to index the addresses somewhere anyway.
	It should calculate the balance lazily, so it only calculates the balance when requested.
	But it can keep like block height range or something to make it faster.
*/

const SCRIPT_TYPE = {
	pointer: 0,
	raw: 1,
	p2pkh: 2,
	p2sh: 3,
	p2wpkh: 4,
	p2wsh: 5,
	p2tr: 6,
} as const;

export type StoredTxOutput =
	| { value: bigint; spent: boolean; scriptType: "pointer"; chunkId: number; offset: number }
	| { value: bigint; spent: boolean; scriptType: "script"; scriptPubKey: Uint8Array };

function detectCompact(script: Uint8Array):
	| { typeId: number; payload: Uint8Array }
	| null {
	// p2pkh: OP_DUP OP_HASH160 <20> <hash160> OP_EQUALVERIFY OP_CHECKSIG
	if (
		script.length === 25 &&
		script[0] === 0x76 && script[1] === 0xa9 &&
		script[2] === 0x14 && script[23] === 0x88 && script[24] === 0xac
	) {
		return { typeId: SCRIPT_TYPE.p2pkh, payload: script.subarray(3, 23) };
	}
	// p2sh: OP_HASH160 <20> <hash160> OP_EQUAL
	if (script.length === 23 && script[0] === 0xa9 && script[1] === 0x14 && script[22] === 0x87) {
		return { typeId: SCRIPT_TYPE.p2sh, payload: script.subarray(2, 22) };
	}
	// p2wpkh: 0x00 0x14 <20>
	if (script.length === 22 && script[0] === 0x00 && script[1] === 0x14) {
		return { typeId: SCRIPT_TYPE.p2wpkh, payload: script.subarray(2) };
	}
	// p2wsh: 0x00 0x20 <32>
	if (script.length === 34 && script[0] === 0x00 && script[1] === 0x20) {
		return { typeId: SCRIPT_TYPE.p2wsh, payload: script.subarray(2) };
	}
	// p2tr: OP_1 0x20 <32>
	if (script.length === 34 && script[0] === 0x51 && script[1] === 0x20) {
		return { typeId: SCRIPT_TYPE.p2tr, payload: script.subarray(2) };
	}
	return null;
}

function reconstructScript(typeId: number, payload: Uint8Array): Uint8Array {
	switch (typeId) {
		case SCRIPT_TYPE.p2pkh:
			return Uint8Array.of(0x76, 0xa9, 0x14, ...payload, 0x88, 0xac);
		case SCRIPT_TYPE.p2sh:
			return Uint8Array.of(0xa9, 0x14, ...payload, 0x87);
		case SCRIPT_TYPE.p2wpkh:
			return Uint8Array.of(0x00, 0x14, ...payload);
		case SCRIPT_TYPE.p2wsh:
			return Uint8Array.of(0x00, 0x20, ...payload);
		case SCRIPT_TYPE.p2tr:
			return Uint8Array.of(0x51, 0x20, ...payload);
		default:
			throw new Error(`Cannot reconstruct unknown compact type ${typeId}`);
	}
}

export class StoredTxOutputCodec extends Codec<StoredTxOutput> {
	public readonly stride = -1;

	encode(obj: StoredTxOutput): Uint8Array {
		if (obj.value < 0n || obj.value >= (1n << 51n)) {
			throw new Error("Value out of range for 51-bit integer");
		}

		let typeId: number;
		let payload: Uint8Array;

		if (obj.scriptType === "pointer") {
			typeId = SCRIPT_TYPE.pointer;
			payload = new Uint8Array(6);
			payload[0] = obj.chunkId & 0xff;
			payload[1] = (obj.chunkId >> 8) & 0xff;
			payload[2] = obj.offset & 0xff;
			payload[3] = (obj.offset >> 8) & 0xff;
			payload[4] = (obj.offset >> 16) & 0xff;
			payload[5] = (obj.offset >> 24) & 0xff;
		} else {
			const detected = detectCompact(obj.scriptPubKey);
			if (detected) {
				typeId = detected.typeId;
				payload = detected.payload;
			} else {
				typeId = SCRIPT_TYPE.raw;
				payload = obj.scriptPubKey;
			}
		}

		let bits = BigInt(typeId);
		if (obj.spent) bits |= 1n << 4n; // spent flag is bit 4

		const combined = (bits << 51n) | obj.value;

		const header = new Uint8Array(7);
		for (let i = 0; i < 7; i++) {
			header[i] = Number((combined >> BigInt(i * 8)) & 0xffn);
		}

		const out = new Uint8Array(7 + payload.length);
		out.set(header, 0);
		out.set(payload, 7);
		return out;
	}

	decode(data: Uint8Array): StoredTxOutput {
		if (data.length < 7) throw new Error("Invalid data length for StoredTxOutput");

		let combined = 0n;
		for (let i = 0; i < 7; i++) {
			combined |= BigInt(data[i]!) << BigInt(i * 8);
		}

		const value = combined & ((1n << 51n) - 1n);
		const bits = combined >> 51n;

		const spent = (bits & (1n << 4n)) !== 0n;
		const typeId = Number(bits & 0xfn);

		const payload = data.subarray(7);

		if (typeId === SCRIPT_TYPE.pointer) {
			if (payload.length !== 6) throw new Error("Invalid pointer payload length");
			return {
				value,
				spent,
				scriptType: "pointer",
				chunkId: payload[0]! | (payload[1]! << 8),
				offset: payload[2]! |
					(payload[3]! << 8) |
					(payload[4]! << 16) |
					(payload[5]! << 24),
			};
		}
		if (typeId === SCRIPT_TYPE.raw) {
			return { value, spent, scriptType: "script", scriptPubKey: payload };
		}
		// compact form → reconstruct to script
		const script = reconstructScript(typeId, payload);
		return { value, spent, scriptType: "script", scriptPubKey: script };
	}
}

export const StoredTxOutput = new StoredTxOutputCodec();
