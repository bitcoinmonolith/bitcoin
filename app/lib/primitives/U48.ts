import { Codec } from "@nomadshiba/codec";

export class U48 extends Codec<number> {
	public readonly stride = 6;
	public encode(value: number): Uint8Array {
		if (value < 0 || value > 0x0000FFFFFFFFFFFF) {
			throw new Error("Value out of range for U48");
		}
		const bytes = new Uint8Array(this.stride);
		for (let i = 0; i < this.stride; i++) {
			bytes[i] = (value >> (i * 8)) & 0xFF;
		}
		return bytes;
	}

	public decode(data: Uint8Array): number {
		if (data.length !== this.stride) {
			throw new Error("Invalid data length for U48");
		}
		let value = 0;
		for (let i = 0; i < this.stride; i++) {
			value |= data[i]! << (i * 8);
		}
		return value;
	}
}

export const u48 = new U48();
