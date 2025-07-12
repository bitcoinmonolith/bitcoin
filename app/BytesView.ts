export type BytesView<T extends ArrayBufferLike> = DataView<T>;
export function BytesView<T extends ArrayBufferLike>(bytes: Uint8Array<T>): BytesView<T> {
	return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
