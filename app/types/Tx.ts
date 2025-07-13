import { DataType } from "../DataType.ts";
import { bytesConcat } from "../utils/bytes.ts";
import { readVarIntNumber, writeVarInt } from "../utils/encoding.ts";

export type Tx = {
	version: number;
	inputs: Tx.Input[];
	outputs: Tx.Output[];
	locktime: number;
};

export declare namespace Tx {
	type Input = {
		txid: Uint8Array; // 32 bytes
		vout: number;
		scriptSig: Uint8Array;
		sequence: number;
		witness?: Uint8Array[];
	};

	type Output = {
		value: bigint;
		scriptPubKey: Uint8Array;
	};
}

export const Tx: DataType<Tx[]> = {
	serialize(data) {
		const chunks: Uint8Array[] = [];

		for (const tx of data) {
			const txChunks: Uint8Array[] = [];

			// Version
			const versionBuf = new Uint8Array(4);
			new DataView(versionBuf.buffer).setInt32(0, tx.version, true);
			txChunks.push(versionBuf);

			// Determine if any input has witness
			const hasWitness = tx.inputs.some((input) => input.witness !== undefined);

			if (hasWitness) {
				txChunks.push(Uint8Array.of(0x00, 0x01)); // Marker and flag
			}

			// Inputs
			txChunks.push(writeVarInt(tx.inputs.length));
			for (const input of tx.inputs) {
				// Reverse txid
				txChunks.push(input.txid.slice().reverse());

				const voutBuf = new Uint8Array(4);
				new DataView(voutBuf.buffer).setUint32(0, input.vout, true);
				txChunks.push(voutBuf);

				txChunks.push(writeVarInt(input.scriptSig.length));
				txChunks.push(input.scriptSig);

				const seqBuf = new Uint8Array(4);
				new DataView(seqBuf.buffer).setUint32(0, input.sequence, true);
				txChunks.push(seqBuf);
			}

			// Outputs
			txChunks.push(writeVarInt(tx.outputs.length));
			for (const output of tx.outputs) {
				const valBuf = new Uint8Array(8);
				new DataView(valBuf.buffer).setBigUint64(0, output.value, true);
				txChunks.push(valBuf);

				txChunks.push(writeVarInt(output.scriptPubKey.length));
				txChunks.push(output.scriptPubKey);
			}

			// Witness data (if any)
			if (hasWitness) {
				for (const input of tx.inputs) {
					const witness = input.witness ?? [];
					txChunks.push(writeVarInt(witness.length));
					for (const item of witness) {
						txChunks.push(writeVarInt(item.length));
						txChunks.push(item);
					}
				}
			}

			// Locktime
			const lockBuf = new Uint8Array(4);
			new DataView(lockBuf.buffer).setUint32(0, tx.locktime, true);
			txChunks.push(lockBuf);

			// Combine txChunks
			chunks.push(bytesConcat(...txChunks));
		}

		return bytesConcat(...chunks);
	},
	deserialize(bytes) {
		let offset = 0;

		const txs: Tx[] = [];

		while (offset < bytes.byteLength) {
			const version = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, true);
			offset += 4;

			const marker = bytes[offset];
			const flag = bytes[offset + 1];
			let hasWitness = false;

			if (marker === 0x00 && flag === 0x01) {
				hasWitness = true;
				offset += 2;
			}

			const [vinCount, vinOff] = readVarIntNumber(bytes, offset);
			offset = vinOff;

			const inputs: Tx.Input[] = [];
			for (let i = 0; i < vinCount; i++) {
				const txid = bytes.slice(offset, offset + 32).reverse();
				offset += 32;

				const vout = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
				offset += 4;

				const [ScriptLen, scriptOff] = readVarIntNumber(bytes, offset);
				offset = scriptOff;

				const scriptSig = bytes.slice(offset, offset + ScriptLen);
				offset += ScriptLen;

				const sequence = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
				offset += 4;

				inputs.push({ txid, vout, scriptSig, sequence });
			}

			const [voutCount, voutOff] = readVarIntNumber(bytes, offset);
			offset = voutOff;

			const outputs: Tx.Output[] = [];
			for (let i = 0; i < voutCount; i++) {
				const value = new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, true);
				offset += 8;

				const [pkLen, pkOff] = readVarIntNumber(bytes, offset);
				offset = pkOff;

				const scriptPubKey = bytes.slice(offset, offset + pkLen);
				offset += pkLen;

				outputs.push({ value, scriptPubKey });
			}

			if (hasWitness) {
				for (let i = 0; i < vinCount; i++) {
					const [itemCount, itemOff] = readVarIntNumber(bytes, offset);
					offset = itemOff;

					const items: Uint8Array[] = [];

					for (let j = 0; j < itemCount; j++) {
						const [len, lenOff] = readVarIntNumber(bytes, offset);
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

			txs.push({ version, inputs, outputs, locktime });
		}

		return txs;
	},
};
