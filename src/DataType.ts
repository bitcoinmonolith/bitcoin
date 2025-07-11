export type DataType<T> = {
	serialize(data: T): Uint8Array;
	deserialize(buffer: Uint8Array): T;
};
