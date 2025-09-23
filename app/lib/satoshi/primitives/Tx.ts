import { Codec } from "@nomadshiba/codec";
import { concat } from "@std/bytes";
import { CompactSize } from "~/lib/CompactSize.ts";
import { BytesView } from "~/lib/BytesView.ts";
import { SequenceLock } from "~/lib/primitives/weirdness/SequenceLock.ts";
import { TimeLock } from "~/lib/primitives/weirdness/TimeLock.ts";
import { sha256 } from "@noble/hashes/sha2";

export type Tx = Readonly<{
	version: number;
	vin: TxIn[];
	vout: TxOut[];
	lockTime: TimeLock;
	witness: boolean;
}>;

export type TxIn = Readonly<{
	txId: Uint8Array; // 32 bytes, LE on wire
	vout: number;
	scriptSig: Uint8Array;
	sequenceLock: SequenceLock;
	witness: Uint8Array[];
}>;

export type TxOut = Readonly<{
	value: bigint; // 8 bytes, LE
	scriptPubKey: Uint8Array;
}>;

export class TxCodec extends Codec<Tx> {
	public readonly stride = -1;

	public encode(tx: Tx): Uint8Array {
		const chunks: Uint8Array[] = [];

		// version (int32 LE)
		const verBuf = new Uint8Array(4);
		new BytesView(verBuf).setInt32(0, tx.version, true);
		chunks.push(verBuf);

		// segwit marker+flags per BIP-144
		const hasWitness = tx.witness && tx.vin.some((v) => v.witness.length > 0);
		if (hasWitness) {
			chunks.push(Uint8Array.of(0x00, 0x01)); // marker=0x00, flags=0x01 (only bit 0 used)
		}

		// vin
		chunks.push(CompactSize.encode(tx.vin.length));
		for (const vin of tx.vin) {
			chunks.push(vin.txId); // already LE on wire

			const voutBuf = new Uint8Array(4);
			new BytesView(voutBuf).setUint32(0, vin.vout, true);
			chunks.push(voutBuf);

			chunks.push(CompactSize.encode(vin.scriptSig.length));
			chunks.push(vin.scriptSig);

			const seqBuf = new Uint8Array(4);
			new BytesView(seqBuf).setUint32(0, SequenceLock.encode(vin.sequenceLock), true);
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

		// witnesses (only if hasWitness and flags bit 0 set)
		if (hasWitness) {
			for (const vin of tx.vin) {
				chunks.push(CompactSize.encode(vin.witness.length));
				for (const item of vin.witness) {
					chunks.push(CompactSize.encode(item.length));
					chunks.push(item);
				}
			}
		}

		// locktime (uint32 LE)
		const lockBuf = new Uint8Array(4);
		new BytesView(lockBuf).setUint32(0, TimeLock.encode(tx.lockTime), true);
		chunks.push(lockBuf);

		return concat(chunks);
	}

	public decode(bytes: Uint8Array): Tx {
		let offset = 0;

		// version (int32 LE)
		const version = new BytesView(bytes, offset, 4).getInt32(0, true);
		offset += 4;

		// ---- BIP-144 marker/flags handling (match Core logic) ----
		let hasWitness = false;
		let flags = 0;

		// first read vin vector length
		let [vinCount, offAfterVinCount] = CompactSize.decode(bytes, offset);
		offset = offAfterVinCount;

		if (vinCount === 0) {
			// possible segwit marker (marker is always 0x00, we've just read vinCount==0)
			flags = bytes[offset] ?? 0;
			offset += 1;

			if (flags !== 0) {
				// segwit: re-read vin, then later we'll read vout normally
				[vinCount, offAfterVinCount] = CompactSize.decode(bytes, offset);
				offset = offAfterVinCount;
				hasWitness = (flags & 1) !== 0; // only bit 0 currently used
			}
			// if flags == 0, it's actually an empty vin (malformed or special cases),
			// we'll proceed with vinCount==0 and no witness.
		}

		// vin
		const vin: TxIn[] = [];
		for (let i = 0; i < vinCount; i++) {
			// copy slices to avoid aliasing the original buffer
			const txId = bytes.subarray(offset, offset + 32);
			offset += 32;

			const vout = new BytesView(bytes, offset, 4).getUint32(0, true);
			offset += 4;

			const [scriptLen, scriptOff] = CompactSize.decode(bytes, offset);
			offset = scriptOff;
			const scriptSig = bytes.subarray(offset, offset + scriptLen);
			offset += scriptLen;

			const sequence = new BytesView(bytes, offset, 4).getUint32(0, true);
			offset += 4;

			vin.push({
				txId,
				vout,
				scriptSig,
				sequenceLock: SequenceLock.decode(sequence),
				witness: [],
			});
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

		// witness stacks (present iff hasWitness == true)
		if (hasWitness) {
			for (let i = 0; i < vinCount; i++) {
				const [nItems, nOff] = CompactSize.decode(bytes, offset);
				offset = nOff;

				const witness = vin[i]!.witness as Uint8Array[];
				for (let j = 0; j < nItems; j++) {
					const [len, lenOff] = CompactSize.decode(bytes, offset);
					offset = lenOff;
					const item = bytes.subarray(offset, offset + len);
					offset += len;
					witness.push(item);
				}
			}
		}

		// locktime (uint32 LE)
		const locktime = new BytesView(bytes, offset, 4).getUint32(0, true);
		offset += 4;

		const tx: Tx = {
			version,
			vin,
			vout,
			lockTime: TimeLock.decode(locktime),
			witness: hasWitness,
		};

		if (tx.witness) {
			wBytesCache.set(tx, bytes.subarray(0, offset));
		} else {
			bytesCache.set(tx, bytes.subarray(0, offset));
		}
		this.lastOffset = offset;
		return tx;
	}

	public lastOffset = 0;
}

export const Tx = new TxCodec();

const bytesCache = new WeakMap<Tx, Uint8Array>();
const txIdCache = new WeakMap<Tx, Uint8Array>();
export function getTxId(tx: Tx): Uint8Array {
	let txId = txIdCache.get(tx);
	if (!txId) {
		let bytes = bytesCache.get(tx);
		if (!bytes) {
			if (tx.witness) {
				bytes = Tx.encode({ ...tx, witness: false });
				bytesCache.set(tx, bytes);
			} else {
				bytes = Tx.encode(tx);
				bytesCache.set(tx, bytes);
				wBytesCache.set(tx, bytes);
			}
		}
		txId = sha256(sha256(bytes));
		txIdCache.set(tx, txId);
	}
	return txId;
}

const wBytesCache = new WeakMap<Tx, Uint8Array>();
const wtxIdCache = new WeakMap<Tx, Uint8Array>();
export function getWTxId(tx: Tx): Uint8Array {
	let wtxId = wtxIdCache.get(tx);
	if (!wtxId) {
		let wbytes = wBytesCache.get(tx);
		if (!wbytes) {
			if (tx.witness) {
				wbytes = Tx.encode(tx);
				wBytesCache.set(tx, wbytes);
			} else {
				wbytes = Tx.encode(tx);
				wBytesCache.set(tx, wbytes);
				bytesCache.set(tx, wbytes);
			}
		}
		wtxId = sha256(sha256(wbytes));
		wtxIdCache.set(tx, wtxId);
	}
	return wtxId;
}
