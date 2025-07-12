import { BlockHeader } from "./BlockHeader.ts";

export type Block = {
	readonly header: BlockHeader;
	readonly body: Uint8Array;
};

export namespace Block {
	export type Init = {
		readonly header: BlockHeader;
		readonly body: Uint8Array;
	};

	export function create(init: Block.Init): Block {
		return { ...init };
	}

	export function from_bytes(bytes: Uint8Array): Block {
		const header = BlockHeader.from_bytes(bytes.subarray(0, 80));
		return {
			header,
			body: bytes.subarray(80),
		};
	}
}
