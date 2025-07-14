export function encodeVarInt(n: number | bigint): Uint8Array {
	if (typeof n === "number") {
		if (n < 0xfd) {
			return Uint8Array.of(n);
		}
		if (n <= 0xffff) {
			const buf = new Uint8Array(3);
			buf[0] = 0xfd;
			buf[1] = n & 0xff;
			buf[2] = n >> 8;
			return buf;
		}
		if (n <= 0xffffffff) {
			const buf = new Uint8Array(5);
			buf[0] = 0xfe;
			new DataView(buf.buffer).setUint32(1, n, true);
			return buf;
		}
		n = BigInt(n); // Promote to bigint if larger
	}

	const buf = new Uint8Array(9);
	buf[0] = 0xff;
	new DataView(buf.buffer).setBigUint64(1, n, true);
	return buf;
}

export function decodeVarInt(bytes: Uint8Array, offset: number): [value: number | bigint, offset: number] {
	const first = bytes[offset]!;
	if (first < 0xfd) {
		return [first, offset + 1];
	}
	if (first === 0xfd) {
		const value = bytes[offset + 1]! | (bytes[offset + 2]! << 8);
		return [value, offset + 3];
	}
	if (first === 0xfe) {
		const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4);
		const value = view.getUint32(0, true);
		return [value, offset + 5];
	}
	if (first === 0xff) {
		const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 8);
		const value = view.getBigUint64(0, true);
		return [value, offset + 9]; // Return as bigint
	}
	throw new Error("Invalid VarInt prefix");
}

export function decodeVarIntNumber(bytes: Uint8Array, offset: number): [value: number, offset: number] {
	const [arg1, arg2] = decodeVarInt(bytes, offset);
	return [Number(arg1), arg2];
}
