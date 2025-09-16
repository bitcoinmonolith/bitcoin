import { bool, bytes, Codec, i32, Struct, Tuple, u32, u64, Vector } from "@nomadshiba/struct-js";
import { equals } from "@std/bytes";
import { join } from "@std/path";
import { bytesToHex } from "@noble/hashes/utils";
import { DATA_BASE_DIR } from "~/lib/constants.ts";
import { Block } from "~/lib/primitives/Block.ts";
import { bytes32 } from "~/lib/primitives/Bytes32.ts";
import { getTxId } from "~/lib/primitives/Tx.ts";
import { u24 } from "~/lib/primitives/U24.ts";
import { Store } from "~/lib/Store.ts";
import { AbsoluteLock } from "~/lib/weirdness/AbsoluteLock.ts";
import { SequenceLock } from "~/lib/weirdness/SequenceLock.ts";
import { WeakRefMap } from "../WeakRefMap.ts";

// TODO: Right now we are using index ids to point to outputs in a tx, or txs in a block.
// But later we should directly point to the byte offset in the block.
// So we dont have to decode the whole block to read a single tx or tx output.

const BLOCKS_PER_CHUNK = 12_500; // About 20GB per chunk with modern blocks
const BLOCKS_BASE_DIR = join(DATA_BASE_DIR, "blocks");

type TxInData = Codec.Infer<typeof TxInData>;
const TxInData = new Struct({
	txBlockHeight: u24,
	txIndex: u24,
	vout: u24,
	sequence: u32,
	scriptSig: bytes,
});

type TxOutData = Codec.Infer<typeof TxOutData>;
const TxOutData = new Struct({
	spent: bool,
	value: u64,
	scriptPubKey: bytes,
});

type TxData = Codec.Infer<typeof TxData>;
const TxData = new Struct({
	txId: bytes32,
	version: i32,
	lockTime: u32,
	vin: new Vector(TxInData),
	vout: new Vector(TxOutData),
});

type CoinbaseTxData = Codec.Infer<typeof CoinbaseTxData>;
const CoinbaseTxData = new Struct({
	txId: bytes32,
	version: i32,
	lockTime: u32,
	sequence: u32,
	coinbase: bytes,
	vout: new Vector(TxOutData),
});

function coinbaseDataToTxData(coinbase: CoinbaseTxData): TxData {
	return {
		txId: coinbase.txId,
		version: coinbase.version,
		lockTime: coinbase.lockTime,
		vin: [{
			txBlockHeight: 0,
			txIndex: 0,
			vout: 0,
			sequence: coinbase.sequence,
			scriptSig: coinbase.coinbase,
		}],
		vout: coinbase.vout,
	};
}

type BlockHeaderData = Codec.Infer<typeof BlockHeaderData>;
const BlockHeaderData = new Struct({
	version: i32,
	prevHash: bytes32,
	merkleRoot: bytes32,
	timestamp: u32,
	bits: u32,
	nonce: u32,
});

type BlockData = Codec.Infer<typeof BlockData>;
const BlockData = new Struct({
	header: BlockHeaderData,
	coinbase: CoinbaseTxData,
	txs: new Vector(TxData),
});

type BlockRange = {
	start: number;
	end: number;
};

function getBlockRange(blockHeight: number): BlockRange {
	const start = blockHeight - (blockHeight % BLOCKS_PER_CHUNK);
	const end = start + BLOCKS_PER_CHUNK;
	return { start, end };
}

const cache = new WeakRefMap<string, Store<[number], BlockData>>();
function getBlockStore(range: BlockRange) {
	const name = `blocks-${range.start}-${range.end}`;
	let store = cache.get(name);
	if (!store) {
		store = new Store([u24], BlockData, {
			base: BLOCKS_BASE_DIR,
			name,
		});
		cache.set(name, store);
	}
	return store;
}

// TODO: Later make this multiple files based prefix
const txIdIndexStore = new Store([bytes], new Tuple([u24, u32]), {
	base: DATA_BASE_DIR,
	name: "txId-index",
});

const TX_INDEX_PREFIX_STEP = 2;
const TX_INDEX_MIN_PREFIX_LENGTH = 8;
async function indexTxByTxId(tx: TxData, blockHeight: number, txIndex: number) {
	// Last prefix is the shortest one
	const prefixes: [Uint8Array][] = [];
	for (let length = tx.txId.length; length >= TX_INDEX_MIN_PREFIX_LENGTH; length -= TX_INDEX_PREFIX_STEP) {
		prefixes.push([tx.txId.subarray(0, length)]);
	}

	await txIdIndexStore.transaction().execute(async (store) => {
		const existingMatches = await store.getMany(prefixes);
		if (existingMatches.length > 1) {
			throw new Error("Unexpected multiple entries for txId prefixes, this should never happen");
		}
		const existingMatch = existingMatches[0];

		if (!existingMatch) {
			// No collision, safe to add
			await store.set(prefixes.at(-1)!, [blockHeight, txIndex]);
			return;
		}

		const [existingPrefix, [existingBlockHeight, existingTxIndex]] = existingMatch;
		if (existingBlockHeight === blockHeight && existingTxIndex === txIndex) {
			// Same entry, nothing to do
			return;
		}

		// Collision detected, need to find the existing txId
		const existingBlockRange = getBlockRange(existingBlockHeight);
		const existingStore = getBlockStore(existingBlockRange);
		const existingBlock = (await existingStore.get([existingBlockHeight - existingBlockRange.start])).at(0);
		if (!existingBlock) {
			throw new Error("Inconsistent state: existing block not found");
		}
		const existingTx = existingBlock.txs[existingTxIndex];
		if (!existingTx) {
			throw new Error("Inconsistent state: existing tx not found in block");
		}

		// Find the point where they differ
		let diffIndex = 0;
		while (tx.txId[diffIndex] === existingTx.txId[diffIndex]) {
			diffIndex++;
		}

		// Extend both prefixes to the next step after the differing byte
		const newPrefixLength = Math.min(32, diffIndex + TX_INDEX_PREFIX_STEP);
		const newPrefix = tx.txId.subarray(0, newPrefixLength);
		const newExistingPrefix = existingTx.txId.subarray(0, newPrefixLength);

		// Update the index with the new prefixes
		await store.set([newPrefix], [blockHeight, txIndex]);
		await store.set([newExistingPrefix], [existingBlockHeight, existingTxIndex]);

		// Remove the old prefixes
		await store.delete(existingPrefix);
	});
}

type TxIndexResult = {
	tx: TxData;
	blockHeight: number;
	txIndex: number;
};
async function getTxByTxId(
	txId: Uint8Array,
	current: { block: Block; blockHeight: number },
): Promise<TxIndexResult | undefined> {
	const prefixes: [Uint8Array][] = [];
	for (let length = txId.length; length >= TX_INDEX_MIN_PREFIX_LENGTH; length -= TX_INDEX_PREFIX_STEP) {
		prefixes.push([txId.subarray(0, length)]);
	}
	const matches = await txIdIndexStore.getMany(prefixes);
	if (matches.length > 1) {
		throw new Error("Unexpected multiple entries for txId prefixes, this should never happen");
	}
	const match = matches[0];
	if (!match) {
		return undefined;
	}
	const [, [blockHeight, txIndex]] = match;

	// TODO: If tx is in the same block we are kinda having a little issues, have to fix this later.
	if (current.blockHeight === blockHeight) {
		const tx = current.block.txs[txIndex];
		if (!tx) {
			throw new Error("Inconsistent state: tx not found in current block");
		}
		const txIdMatch = equals(getTxId(tx), txId);
		if (!txIdMatch) {
			throw new Error("Inconsistent state: txId mismatch in current block");
		}
		const txData: TxData = {
			txId: getTxId(tx),
			version: tx.version,
			lockTime: AbsoluteLock.encode(tx.lockTime),
			vin: tx.vin.map((vinEntry): TxInData => ({
				txBlockHeight: blockHeight, // Since we are in the same block
				txIndex,
				vout: vinEntry.vout,
				sequence: SequenceLock.encode(vinEntry.sequenceLock),
				scriptSig: vinEntry.scriptSig,
			})),
			vout: tx.vout.map((out) => ({
				spent: false, // Placeholder, as we don't track spent status here
				value: out.value,
				scriptPubKey: out.scriptPubKey,
			})),
		};
		return { tx: txData, blockHeight, txIndex };
	}

	const blockRange = getBlockRange(blockHeight);
	const localHeight = blockHeight - blockRange.start;
	const store = getBlockStore(blockRange);
	const block = (await store.get([localHeight])).at(0);
	if (!block) {
		console.log("Cannot find block", { blockHeight, localHeight });
		throw new Error("Inconsistent state: block not found");
	}
	const tx = txIndex ? block.txs[txIndex - 1] : coinbaseDataToTxData(block.coinbase);
	if (!tx) {
		console.log("Cannot find tx in block", { blockHeight, txIndex });
		console.log("Existing txs in block:", block.txs.map((t) => bytesToHex(t.txId.toReversed())));
		throw new Error("Inconsistent state: tx not found in block");
	}

	if (!equals(tx.txId, txId)) {
		console.log("Mismatched txId", { expected: bytesToHex(txId), actual: bytesToHex(tx.txId) });
		return undefined;
	}
	return { tx, blockHeight, txIndex };
}

export async function saveBlock(blockHeight: number, block: Block) {
	const range = getBlockRange(blockHeight);
	const store = getBlockStore(range);
	const localHeight = blockHeight - range.start;

	const existing = (await store.get([localHeight])).at(0);
	if (existing) {
		// Block already saved, nothing to do
		return;
	}

	const coinbaseTx = block.txs.at(0);
	if (!coinbaseTx) {
		throw new Error("Block has no transactions");
	}

	const coinbaseTxVin = coinbaseTx.vin.at(0);
	if (!coinbaseTxVin) {
		throw new Error("Coinbase transaction has no inputs");
	}

	const coinbase: CoinbaseTxData = {
		txId: getTxId(coinbaseTx),
		version: coinbaseTx.version,
		lockTime: AbsoluteLock.encode(coinbaseTx.lockTime),
		sequence: SequenceLock.encode(coinbaseTxVin.sequenceLock),
		coinbase: coinbaseTxVin.scriptSig,
		vout: coinbaseTx.vout.map((out): TxOutData => ({
			spent: false,
			value: out.value,
			scriptPubKey: out.scriptPubKey,
		})),
	};
	await indexTxByTxId(coinbaseDataToTxData(coinbase), blockHeight, 0);

	const txs: TxData[] = [];
	for (const tx of block.txs.values().drop(1)) {
		const txId = getTxId(tx);
		const vin: TxInData[] = [];
		for (const vinEntry of tx.vin) {
			const txIndexResult = await getTxByTxId(vinEntry.txId, { block, blockHeight });
			if (!txIndexResult) {
				console.log("Missing txId:", bytesToHex(vinEntry.txId.toReversed()));
				throw new Error("Referenced UTXO transaction not found");
			}

			vin.push({
				txBlockHeight: txIndexResult.blockHeight,
				txIndex: txIndexResult.txIndex,
				vout: vinEntry.vout,
				sequence: SequenceLock.encode(vinEntry.sequenceLock),
				scriptSig: vinEntry.scriptSig,
			});
		}

		const data: TxData = {
			txId,
			version: tx.version,
			lockTime: AbsoluteLock.encode(tx.lockTime),
			vin,
			vout: tx.vout.map((out): TxOutData => ({
				spent: false,
				value: out.value,
				scriptPubKey: out.scriptPubKey,
			})),
		};
		txs.push(data);
		await indexTxByTxId(data, blockHeight, txs.length);
	}

	const { header } = block;

	const data: BlockData = { header, coinbase, txs };

	await store.set([localHeight], data);
}
