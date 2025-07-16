import { sha256 } from "@noble/hashes/sha2";
import { concat } from "jsr:@std/bytes";

export function taggedHash(tag: string, msg: Uint8Array): Uint8Array {
	const tagHash = sha256(new TextEncoder().encode(tag));
	return sha256(concat([tagHash, tagHash, msg]));
}

export function encodeScriptNumber(value: bigint): Uint8Array {
	if (value === 0n) return new Uint8Array([]);

	const neg = value < 0n;
	let abs = neg ? -value : value;

	const result: number[] = [];
	while (abs > 0n) {
		result.push(Number(abs & 0xffn));
		abs >>= 8n;
	}

	// Add sign bit if needed
	if (result[result.length - 1]! & 0x80) {
		result.push(neg ? 0x80 : 0x00);
	} else if (neg) {
		result[result.length - 1]! |= 0x80;
	}

	return new Uint8Array(result);
}

export function decodeScriptNumber(buf: Uint8Array): bigint {
	if (buf.length === 0) return 0n;

	const lastByte = buf[buf.length - 1]!;
	const signBit = (lastByte & 0x80) !== 0;

	// Copy buffer and strip sign bit
	const clean = new Uint8Array(buf);
	clean[clean.length - 1] = lastByte & 0x7f;

	let result = 0n;
	for (let i = 0; i < clean.length; i++) {
		result |= BigInt(clean[i]!) << (8n * BigInt(i));
	}

	return signBit ? -result : result;
}

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
