import { Codec } from "@nomadshiba/struct-js";

export class Bytes32 extends Codec<Uint8Array> {
	public readonly stride = 32;

	public encode(data: Uint8Array): Uint8Array {
		if (data.length !== this.stride) {
			throw new Error(`Bytes32 must be ${this.stride} bytes long, got ${data.length}`);
		}
		return data;
	}

	public decode(bytes: Uint8Array): Uint8Array {
		if (bytes.length !== this.stride) {
			throw new Error(`Bytes32 must be ${this.stride} bytes long, got ${bytes.length}`);
		}
		return bytes;
	}
}

export const bytes32 = new Bytes32();
