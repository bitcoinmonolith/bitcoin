export type TxInput = {
	txid: Uint8Array; // 32 bytes
	vout: number;
	scriptSig: Uint8Array;
	sequence: number;
	witness?: Uint8Array[];
};

export type TxOutput = {
	value: bigint;
	scriptPubKey: Uint8Array;
};

export type Tx = {
	version: number;
	inputs: TxInput[];
	outputs: TxOutput[];
	locktime: number;
};

export function readVarInt(bytes: Uint8Array, offset: number): [number, number] {
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
		if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
			// We will never throw this, its impossible to have txs that big.
			throw new Error("VarInt too large for JS number, THIS SHOULD NEVER HAPPEN");
		}
		return [Number(value), /* numbers that big is not realistic for tx size */ offset + 9];
	}
	throw new Error("Invalid VarInt prefix");
}

export namespace Tx {
	export function parse(bytes: Uint8Array, start = 0): [Tx, number] {
		let offset = start;

		const version = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, true);
		offset += 4;

		const marker = bytes[offset];
		const flag = bytes[offset + 1];
		let hasWitness = false;

		if (marker === 0x00 && flag === 0x01) {
			hasWitness = true;
			offset += 2;
		}

		const [vinCount, vinOff] = readVarInt(bytes, offset);
		offset = vinOff;

		const inputs: TxInput[] = [];
		for (let i = 0; i < vinCount; i++) {
			const txid = bytes.slice(offset, offset + 32).reverse();
			offset += 32;

			const vout = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
			offset += 4;

			const [scriptLen, scriptOff] = readVarInt(bytes, offset);
			offset = scriptOff;

			const scriptSig = bytes.slice(offset, offset + scriptLen);
			offset += scriptLen;

			const sequence = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
			offset += 4;

			inputs.push({ txid, vout, scriptSig, sequence });
		}

		const [voutCount, voutOff] = readVarInt(bytes, offset);
		offset = voutOff;

		const outputs: TxOutput[] = [];
		for (let i = 0; i < voutCount; i++) {
			const value = new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, true);
			offset += 8;

			const [pkLen, pkOff] = readVarInt(bytes, offset);
			offset = pkOff;

			const scriptPubKey = bytes.slice(offset, offset + pkLen);
			offset += pkLen;

			outputs.push({ value, scriptPubKey });
		}

		if (hasWitness) {
			for (let i = 0; i < vinCount; i++) {
				const [itemCount, itemOff] = readVarInt(bytes, offset);
				offset = itemOff;

				const items: Uint8Array[] = [];

				for (let j = 0; j < itemCount; j++) {
					const [len, lenOff] = readVarInt(bytes, offset);
					offset = lenOff;

					const item = bytes.slice(offset, offset + len);
					offset += len;

					items.push(item);
				}

				inputs[i]!.witness = items;
			}
		}

		const locktime = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
		offset += 4;

		return [{ version, inputs, outputs, locktime }, offset];
	}
}
