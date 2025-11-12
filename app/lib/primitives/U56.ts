import { Codec } from "@nomadshiba/codec";

export class U56 extends Codec<bigint> {
	public readonly stride = 7;
	public encode(value: bigint): Uint8Array {
		if (value < 0n || value > 0x00FFFFFFFFFFFFn) {
			throw new Error("Value out of range for U56");
		}
		const bytes = new Uint8Array(this.stride);
		for (let i = 0; i < this.stride; i++) {
			bytes[i] = Number((value >> BigInt(i * 8)) & 0xFFn);
		}
		return bytes;
	}

	public decode(data: Uint8Array): [bigint, number] {
		if (data.length < this.stride) {
			throw new Error("Invalid data length for U56");
		}
		let value = 0n;
		for (let i = 0; i < this.stride; i++) {
			value |= BigInt(data[i]!) << BigInt(i * 8);
		}
		return [value, this.stride];
	}
}

export const u56 = new U56();
