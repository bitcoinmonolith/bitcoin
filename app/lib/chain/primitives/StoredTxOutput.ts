import { Codec } from "@nomadshiba/codec";

export type StoredTxOutput = {
	value: bigint; // 51-bit satoshi amount
	spent: boolean; // 1 bit
	scriptPubKey:
		| {
			isPointer: false; // 1 bit
			script: Uint8Array; // rest after 7-byte prefix
		}
		| {
			isPointer: true; // 1 bit
			chunkId: number; // u16
			offset: number; // u32
		};
	unused0: boolean; // 1 bit
	unused1: boolean; // 1 bit
	unused2: boolean; // 1 bit
};

export class StoredTxOutputCodec extends Codec<StoredTxOutput> {
	public readonly stride = -1; // dynamic size

	encode(obj: StoredTxOutput): Uint8Array {
		const { value, spent, scriptPubKey, unused0, unused1, unused2 } = obj;

		if (value < 0n || value >= (1n << 51n)) {
			throw new Error("Value out of range for 51-bit integer");
		}

		let bits = 0n;
		if (spent) bits |= 1n << 4n; // bit 55
		if (scriptPubKey.isPointer) bits |= 1n << 3n; // bit 54
		if (unused0) bits |= 1n << 2n; // bit 53
		if (unused1) bits |= 1n << 1n; // bit 52
		if (unused2) bits |= 1n << 0n; // bit 51

		const combined = (bits << 51n) | value;

		// 7-byte prefix
		const header = new Uint8Array(7);
		for (let i = 0; i < 7; i++) {
			header[i] = Number((combined >> BigInt(i * 8)) & 0xFFn);
		}

		// append script part
		if (scriptPubKey.isPointer) {
			const buf = new Uint8Array(6); // u16 + u32
			buf[0] = scriptPubKey.chunkId & 0xff;
			buf[1] = (scriptPubKey.chunkId >> 8) & 0xff;
			buf[2] = scriptPubKey.offset & 0xff;
			buf[3] = (scriptPubKey.offset >> 8) & 0xff;
			buf[4] = (scriptPubKey.offset >> 16) & 0xff;
			buf[5] = (scriptPubKey.offset >> 24) & 0xff;

			const out = new Uint8Array(7 + 6);
			out.set(header, 0);
			out.set(buf, 7);
			return out;
		} else {
			const out = new Uint8Array(7 + scriptPubKey.script.length);
			out.set(header, 0);
			out.set(scriptPubKey.script, 7);
			return out;
		}
	}

	decode(data: Uint8Array): StoredTxOutput {
		if (data.length < 7) {
			throw new Error("Invalid data length for StoredTxOutput");
		}

		// read 7-byte prefix
		let combined = 0n;
		for (let i = 0; i < 7; i++) {
			combined |= BigInt(data[i]!) << BigInt(i * 8);
		}
		const value = combined & ((1n << 51n) - 1n);
		const bits = combined >> 51n;

		const spent = (bits & (1n << 4n)) !== 0n;
		const isPointer = (bits & (1n << 3n)) !== 0n;
		const unused0 = (bits & (1n << 2n)) !== 0n;
		const unused1 = (bits & (1n << 1n)) !== 0n;
		const unused2 = (bits & (1n << 0n)) !== 0n;

		if (isPointer) {
			if (data.length < 7 + 6) {
				throw new Error("Invalid pointer script data length");
			}
			const view = data.subarray(7, 13);
			const chunkId = view[0]! | (view[1]! << 8);
			const offset = view[2]! |
				(view[3]! << 8) |
				(view[4]! << 16) |
				(view[5]! << 24);

			return {
				value,
				spent,
				scriptPubKey: { isPointer: true, chunkId, offset },
				unused0,
				unused1,
				unused2,
			};
		} else {
			const script = data.subarray(7);
			return {
				value,
				spent,
				scriptPubKey: { isPointer: false, script },
				unused0,
				unused1,
				unused2,
			};
		}
	}
}

export const StoredTxOutput = new StoredTxOutputCodec();
