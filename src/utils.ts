import { sha256 } from "@noble/hashes/sha2"

export function checksum(payload: Uint8Array): Uint8Array {
	const hash = sha256(sha256(payload));
	return hash.subarray(0, 4);
}

export function writeBytes(target: Uint8Array, source: Uint8Array, offset: number): number {
	target.set(source, offset);
	return offset + source.length;
}

export function concatBytes(chunks: Uint8Array[]): Uint8Array {
    const totalLength = chunks.reduce((sum, b) => sum + b.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    return result
  }
  
// 8-bit unsigned
export function readUInt8(buf: Uint8Array, offset: number): number {
	return buf[offset]!;
}

// 8-bit signed
export function readInt8(buf: Uint8Array, offset: number): number {
	const val = buf[offset]!;
	return val > 0x7f ? val - 0x100 : val;
}

// 16-bit unsigned
export function readUInt16LE(buf: Uint8Array, offset: number): number {
	return buf[offset]! | (buf[offset + 1]! << 8);
}

export function readUInt16BE(buf: Uint8Array, offset: number): number {
	return (buf[offset]! << 8) | buf[offset + 1]!;
}

// 16-bit signed
export function readInt16LE(buf: Uint8Array, offset: number): number {
	const val = readUInt16LE(buf, offset);
	return val > 0x7fff ? val - 0x10000 : val;
}

export function readInt16BE(buf: Uint8Array, offset: number): number {
	const val = readUInt16BE(buf, offset);
	return val > 0x7fff ? val - 0x10000 : val;
}

// 32-bit unsigned
export function readUInt32LE(buf: Uint8Array, offset: number): number {
	return (
		buf[offset]! |
		(buf[offset + 1]! << 8) |
		(buf[offset + 2]! << 16) |
		(buf[offset + 3]! << 24)
	);
}

export function readUInt32BE(buf: Uint8Array, offset: number): number {
	return (
		(buf[offset]! << 24) |
		(buf[offset + 1]! << 16) |
		(buf[offset + 2]! << 8) |
		buf[offset + 3]!
	);
}

// 32-bit signed
export function readInt32LE(buf: Uint8Array, offset: number): number {
	const val = readUInt32LE(buf, offset);
	return val > 0x7fffffff ? val - 0x100000000 : val;
}

export function readInt32BE(buf: Uint8Array, offset: number): number {
	const val = readUInt32BE(buf, offset);
	return val > 0x7fffffff ? val - 0x100000000 : val;
}

// 64-bit unsigned
export function readUInt64LE(buf: Uint8Array, offset: number): bigint {
	let result = 0n;
	for (let i = 0; i < 8; i++) {
		result |= BigInt(buf[offset + i]!) << BigInt(i * 8);
	}
	return result;
}

export function readUInt64BE(buf: Uint8Array, offset: number): bigint {
	let result = 0n;
	for (let i = 0; i < 8; i++) {
		result |= BigInt(buf[offset + i]!) << BigInt((7 - i) * 8);
	}
	return result;
}

// 64-bit signed
export function readInt64LE(buf: Uint8Array, offset: number): bigint {
	const val = readUInt64LE(buf, offset);
	return val > 0x7fffffffffffffffn ? val - 0x10000000000000000n : val;
}

export function readInt64BE(buf: Uint8Array, offset: number): bigint {
	const val = readUInt64BE(buf, offset);
	return val > 0x7fffffffffffffffn ? val - 0x10000000000000000n : val;
}

// 8-bit unsigned
export function writeUInt8(buf: Uint8Array, value: number, offset: number): number {
	buf[offset] = value & 0xff
	return offset + 1
}

// 8-bit signed
export function writeInt8(buf: Uint8Array, value: number, offset: number): number {
	buf[offset] = value < 0 ? 0xff + value + 1 : value
	return offset + 1
}

// 16-bit unsigned
export function writeUInt16LE(buf: Uint8Array, value: number, offset: number): number {
	buf[offset] = value & 0xff
	buf[offset + 1] = (value >> 8) & 0xff
	return offset + 2
}

export function writeUInt16BE(buf: Uint8Array, value: number, offset: number): number {
	buf[offset] = (value >> 8) & 0xff
	buf[offset + 1] = value & 0xff
	return offset + 2
}

// 16-bit signed
export function writeInt16LE(buf: Uint8Array, value: number, offset: number): number {
	const u = value < 0 ? 0x10000 + value : value
	return writeUInt16LE(buf, u, offset)
}

export function writeInt16BE(buf: Uint8Array, value: number, offset: number): number {
	const u = value < 0 ? 0x10000 + value : value
	return writeUInt16BE(buf, u, offset)
}

// 32-bit unsigned
export function writeUInt32LE(buf: Uint8Array, value: number, offset: number): number {
	buf[offset] = value & 0xff
	buf[offset + 1] = (value >> 8) & 0xff
	buf[offset + 2] = (value >> 16) & 0xff
	buf[offset + 3] = (value >> 24) & 0xff
	return offset + 4
}

export function writeUInt32BE(buf: Uint8Array, value: number, offset: number): number {
	buf[offset] = (value >> 24) & 0xff
	buf[offset + 1] = (value >> 16) & 0xff
	buf[offset + 2] = (value >> 8) & 0xff
	buf[offset + 3] = value & 0xff
	return offset + 4
}

// 32-bit signed
export function writeInt32LE(buf: Uint8Array, value: number, offset: number): number {
	const u = value < 0 ? 0x100000000 + value : value
	return writeUInt32LE(buf, u, offset)
}

export function writeInt32BE(buf: Uint8Array, value: number, offset: number): number {
	const u = value < 0 ? 0x100000000 + value : value
	return writeUInt32BE(buf, u, offset)
}

// 64-bit unsigned (BigInt)
export function writeUInt64LE(buf: Uint8Array, value: bigint, offset: number): number {
	for (let i = 0n; i < 8n; i++) {
		buf[offset + Number(i)] = Number((value >> (8n * i)) & 0xffn)
	}
	return offset + 8
}

export function writeUInt64BE(buf: Uint8Array, value: bigint, offset: number): number {
	for (let i = 0n; i < 8n; i++) {
		buf[offset + Number(7n - i)] = Number((value >> (8n * i)) & 0xffn)
	}
	return offset + 8
}

// 64-bit signed (BigInt)
export function writeInt64LE(buf: Uint8Array, value: bigint, offset: number): number {
	const u = value < 0n ? 0x10000000000000000n + value : value
	return writeUInt64LE(buf, u, offset)
}

export function writeInt64BE(buf: Uint8Array, value: bigint, offset: number): number {
	const u = value < 0n ? 0x10000000000000000n + value : value
	return writeUInt64BE(buf, u, offset)
}


// Uint8Array → hex string
export function bytesToHex(bytes: Uint8Array): string {
	return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

// hex string → Uint8Array
export function hexToBytes(hex: string): Uint8Array {
	if (hex.length % 2 !== 0) throw new Error('hexToBytes: hex string must have even length');
	const len = hex.length / 2;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}
