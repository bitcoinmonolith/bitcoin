import { Codec } from "@nomadshiba/struct-js";
import { concat } from "jsr:@std/bytes";
import { CompactSize } from "~/lib/CompactSize.ts";
import { BytesView } from "~/lib/BytesView.ts";

export type Tx = {
	version: number;
	vin: TxIn[];
	vout: TxOut[];
	locktime: number;
	witness: boolean;
};

export type TxIn = {
	txid: Uint8Array; // 32 bytes, LE on wire
	vout: number;
	scriptSig: Uint8Array;
	sequence: number;
	witness: Uint8Array[];
};

export type TxOut = {
	value: bigint; // 8 bytes, LE
	scriptPubKey: Uint8Array;
};

export class TxCodec extends Codec<Tx> {
	public readonly stride = -1;

	public encode(tx: Tx): Uint8Array {
		const chunks: Uint8Array[] = [];

		// version
		const verBuf = new Uint8Array(4);
		new BytesView(verBuf).setInt32(0, tx.version, true);
		chunks.push(verBuf);

		const hasWitness = tx.witness && tx.vin.some((v) => v.witness.length > 0);

		if (hasWitness) {
			chunks.push(Uint8Array.of(0x00, 0x01)); // marker+flag
		}

		// vin
		chunks.push(CompactSize.encode(tx.vin.length));
		for (const vin of tx.vin) {
			chunks.push(vin.txid);

			const voutBuf = new Uint8Array(4);
			new BytesView(voutBuf).setUint32(0, vin.vout, true);
			chunks.push(voutBuf);

			chunks.push(CompactSize.encode(vin.scriptSig.length));
			chunks.push(vin.scriptSig);

			const seqBuf = new Uint8Array(4);
			new BytesView(seqBuf).setUint32(0, vin.sequence, true);
			chunks.push(seqBuf);
		}

		// vout
		chunks.push(CompactSize.encode(tx.vout.length));
		for (const vout of tx.vout) {
			const valBuf = new Uint8Array(8);
			new BytesView(valBuf).setBigUint64(0, vout.value, true);
			chunks.push(valBuf);

			chunks.push(CompactSize.encode(vout.scriptPubKey.length));
			chunks.push(vout.scriptPubKey);
		}

		if (hasWitness) {
			for (const vin of tx.vin) {
				chunks.push(CompactSize.encode(vin.witness.length));
				for (const item of vin.witness) {
					chunks.push(CompactSize.encode(item.length));
					chunks.push(item);
				}
			}
		}

		// locktime
		const lockBuf = new Uint8Array(4);
		new BytesView(lockBuf).setUint32(0, tx.locktime, true);
		chunks.push(lockBuf);

		return concat(chunks);
	}

	public decode(bytes: Uint8Array): Tx {
		let offset = 0;

		// version
		const version = new BytesView(bytes, offset, 4).getInt32(0, true);
		offset += 4;

		let hasWitness = false;
		if (bytes[offset] === 0x00 && bytes[offset + 1] !== 0x00) {
			hasWitness = true;
			offset += 2;
		}

		// vin
		const [vinCount, vinOff] = CompactSize.decode(bytes, offset);
		offset = vinOff;
		const vin: TxIn[] = [];
		for (let i = 0; i < vinCount; i++) {
			const txid = bytes.subarray(offset, offset + 32);
			offset += 32;

			const vout = new BytesView(bytes, offset, 4).getUint32(0, true);
			offset += 4;

			const [scriptLen, scriptOff] = CompactSize.decode(bytes, offset);
			offset = scriptOff;
			const scriptSig = bytes.subarray(offset, offset + scriptLen);
			offset += scriptLen;

			const sequence = new BytesView(bytes, offset, 4).getUint32(0, true);
			offset += 4;

			vin.push({ txid, vout, scriptSig, sequence, witness: [] });
		}

		// vout
		const [voutCount, voutOff] = CompactSize.decode(bytes, offset);
		offset = voutOff;
		const vout: TxOut[] = [];
		for (let i = 0; i < voutCount; i++) {
			const value = new BytesView(bytes, offset, 8).getBigUint64(0, true);
			offset += 8;

			const [pkLen, pkOff] = CompactSize.decode(bytes, offset);
			offset = pkOff;
			const scriptPubKey = bytes.subarray(offset, offset + pkLen);
			offset += pkLen;

			vout.push({ value, scriptPubKey });
		}

		if (hasWitness) {
			for (let i = 0; i < vinCount; i++) {
				const [nItems, nOff] = CompactSize.decode(bytes, offset);
				offset = nOff;

				const items: Uint8Array[] = [];
				for (let j = 0; j < nItems; j++) {
					const [len, lenOff] = CompactSize.decode(bytes, offset);
					offset = lenOff;
					const item = bytes.subarray(offset, offset + len);
					offset += len;
					items.push(item);
				}
				vin[i]!.witness = items;
			}
		}

		const locktime = new BytesView(bytes, offset, 4).getUint32(0, true);
		offset += 4;

		this.lastOffset = offset;
		return {
			version,
			vin,
			vout,
			locktime,
			witness: hasWitness,
		};
	}

	public lastOffset = 0;
}

export const Tx = new TxCodec();
