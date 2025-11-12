import { Codec } from "@nomadshiba/codec";
import { concat } from "@std/bytes";
import { u24 } from "../../primitives/U24.ts";
import { Block } from "../../satoshi/primitives/Block.ts";
import { SequenceLock } from "../../satoshi/primitives/weirdness/SequenceLock.ts";
import { TimeLock } from "../../satoshi/primitives/weirdness/TimeLock.ts";
import { StoredCoinbaseTx } from "./StoredCoinbaseTx.ts";
import { StoredTx } from "./StoredTx.ts";
import { StoredTxInput } from "./StoredTxInput.ts";
import { StoredTxOutput } from "./StoredTxOutput.ts";

export type StoredBlock = {
	coinbase: StoredCoinbaseTx;
	txs: StoredTx[];
};
export class StoredBlockCodec extends Codec<StoredBlock> {
	public readonly stride = -1;

	public encode(value: StoredBlock): Uint8Array {
		const lengthEncoded = u24.encode(value.txs.length);

		const coinbaseEncoded = StoredCoinbaseTx.encode(value.coinbase);
		const txsEncoded = value.txs.values().map((tx) => StoredTx.encode(tx));
		return concat([lengthEncoded, coinbaseEncoded, ...txsEncoded]);
	}

	public decode(data: Uint8Array): [StoredBlock, number] {
		let offset = 0;

		const [txCount, txCountSize] = u24.decode(data.subarray(offset));
		offset += txCountSize;
		const [coinbase, coinbaseSize] = StoredCoinbaseTx.decode(data.subarray(offset));
		offset += coinbaseSize;

		const txs: StoredTx[] = [];
		for (let i = 0; i < txCount; i++) {
			const [tx, txBytes] = StoredTx.decode(data.subarray(offset));
			txs.push(tx);
			offset += txBytes;
		}
		return [{ coinbase, txs }, offset];
	}

	public fromBlock(block: Block): StoredBlock {
		const [coinbaseTx, ...txs] = block.txs;

		if (!coinbaseTx) {
			throw new Error("Block has no transactions");
		}

		const storedTxs: StoredTx[] = [];
		for (const tx of txs) {
			storedTxs.push({
				txId: tx.txId,
				lockTime: TimeLock.encode(tx.lockTime),
				version: tx.version,
				vin: tx.vin.map((vin): StoredTxInput => ({
					kind: "unresolved",
					value: {
						prevOut: {
							txId: vin.txId,
							vout: vin.vout,
						},
						scriptSig: vin.scriptSig,
						sequence: SequenceLock.encode(vin.sequenceLock),
						witness: vin.witness,
					},
				})),
				vout: tx.vout.map((vout): StoredTxOutput => ({
					scriptType: "raw",
					scriptPubKey: vout.scriptPubKey,
					value: vout.value,
					spent: false,
				})),
			});
		}

		return {
			coinbase: {
				txId: coinbaseTx.txId,
				lockTime: TimeLock.encode(coinbaseTx.lockTime),
				version: coinbaseTx.version,
				coinbase: coinbaseTx.vin[0]!.scriptSig,
				sequence: SequenceLock.encode(coinbaseTx.vin[0]!.sequenceLock),
				vout: coinbaseTx.vout.map((vout): StoredTxOutput => ({
					scriptType: "raw",
					scriptPubKey: vout.scriptPubKey,
					value: vout.value,
					spent: false,
				})),
			},
			txs: storedTxs,
		};
	}
}

export const StoredBlock = new StoredBlockCodec();
