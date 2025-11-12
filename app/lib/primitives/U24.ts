import { Codec } from "@nomadshiba/codec";

export class U24 extends Codec<number> {
	public readonly stride = 3;

	public encode(value: number): Uint8Array {
		if (value < 0 || value > 0xFFFFFF || !Number.isInteger(value)) {
			throw new RangeError("U24 out of range: " + value);
		}
		const arr = new Uint8Array(3);
		arr[0] = value & 0xFF;
		arr[1] = (value >>> 8) & 0xFF;
		arr[2] = (value >>> 16) & 0xFF;
		return arr;
	}

	public decode(data: Uint8Array): [number, number] {
		if (data.length < 3) {
			throw new Error("Not enough bytes for U24");
		}
		return [data[0]! | (data[1]! << 8) | (data[2]! << 16), 3];
	}
}

export const u24: U24 = new U24();
