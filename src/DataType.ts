export type DataType<T> = {
	serialize(data: T): Buffer;
	deserialize(buffer: Buffer): T;
};
