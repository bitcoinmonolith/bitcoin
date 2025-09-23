import { Codec } from "@nomadshiba/codec";

export type StoredTxOutputValue = {
	value: bigint; // 51-bit satoshi amount
	spent: boolean;
	scriptIsPointer: boolean;
	flags: [boolean, boolean, boolean]; // 3 extra flags, free to use
};

export class StoredTxOutputValueCodec extends Codec<StoredTxOutputValue> {
	public readonly stride = 7;

	encode(obj: StoredTxOutputValue): Uint8Array {
		const { value, spent, scriptIsPointer, flags } = obj;

		if (value < 0n || value >= (1n << 51n)) {
			throw new Error("Value out of range for 51-bit integer");
		}

		let bits = 0n;
		if (spent) bits |= 1n << 4n; // bit 55
		if (scriptIsPointer) bits |= 1n << 3n; // bit 54
		if (flags[0]) bits |= 1n << 2n; // bit 53
		if (flags[1]) bits |= 1n << 1n; // bit 52
		if (flags[2]) bits |= 1n << 0n; // bit 51

		const combined = (bits << 51n) | value;

		const bytes = new Uint8Array(this.stride);
		for (let i = 0; i < this.stride; i++) {
			bytes[i] = Number((combined >> BigInt(i * 8)) & 0xFFn);
		}
		return bytes;
	}

	decode(data: Uint8Array): StoredTxOutputValue {
		if (data.length !== this.stride) {
			throw new Error("Invalid data length for StoredTxOutputValue");
		}

		let combined = 0n;
		for (let i = 0; i < this.stride; i++) {
			combined |= BigInt(data[i]!) << BigInt(i * 8);
		}

		const value = combined & ((1n << 51n) - 1n);
		const bits = combined >> 51n;

		return {
			value,
			spent: (bits & (1n << 4n)) !== 0n,
			scriptIsPointer: (bits & (1n << 3n)) !== 0n,
			flags: [
				(bits & (1n << 2n)) !== 0n,
				(bits & (1n << 1n)) !== 0n,
				(bits & (1n << 0n)) !== 0n,
			],
		};
	}
}

export const StoredTxOutputValue = new StoredTxOutputValueCodec();
