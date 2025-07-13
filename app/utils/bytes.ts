export function bytes_equal(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a[i]! ^ b[i]!;
	}
	return result === 0;
}

export function bytes_concat(...arrays: Uint8Array[]): Uint8Array {
	const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
	const result = new Uint8Array(totalLength);
	let offset = 0;

	for (const arr of arrays) {
		result.set(arr, offset);
		offset += arr.length;
	}

	return result;
}
