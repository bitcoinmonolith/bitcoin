import { Codec } from "@nomadshiba/codec";

export class PeerMessage<T> {
	public readonly command: string;
	public readonly codec: Codec<T>;

	constructor(command: string, codec: Codec<T>) {
		this.command = command;
		this.codec = codec;
	}
}
