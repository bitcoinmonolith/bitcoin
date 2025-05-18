import { createHash } from "crypto";

export function sha256(buffer: Buffer): Buffer {
	return createHash("sha256").update(buffer).digest();
}

export function doubleSha256(buffer: Buffer): Buffer {
	return sha256(sha256(buffer));
}

export function checksum(payload: Buffer): Buffer {
	return doubleSha256(payload).subarray(0, 4);
}

// TODO: Remove this later, just jump the offset instead
export const zeroPad16 = Buffer.alloc(16);

export function writeBuffer(target: Buffer, source: Buffer, offset: number) {
	return offset + source.copy(target, offset);
}
