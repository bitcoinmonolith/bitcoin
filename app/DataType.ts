export type DataType<T> = {
	serialize(data: T): Uint8Array;
	deserialize(bytes: Uint8Array): T;
};
