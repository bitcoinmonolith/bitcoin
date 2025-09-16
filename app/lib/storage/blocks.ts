import { bool, bytes, Codec, i32, Struct, Tuple, u16, u32, u64, Vector } from "@nomadshiba/struct-js";
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
	utxoBlockHeight: u24,
	utxoTxIndex: u24,
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
			utxoBlockHeight: 0,
			utxoTxIndex: 0,
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

type LocalBlockKey = Tuple.Infer<typeof LocalBlockKey>;
const LocalBlockKey = [u16] as const; // Local height within the chunk

const blockStoreCache = new WeakRefMap<string, Store<LocalBlockKey, BlockData>>();
function getBlockStore(range: BlockRange) {
	const name = `blocks[${range.start},${range.end}]`;
	let store = blockStoreCache.get(name);
	if (!store) {
		store = new Store(LocalBlockKey, BlockData, { base: BLOCKS_BASE_DIR, name });
		blockStoreCache.set(name, store);
	}
	return store;
}

type LocalTxKey = Tuple.Infer<typeof LocalTxKey>;
const LocalTxKey = [u16, u24] as const; // Local block height within the chunk, tx index within the block

const txStoreCache = new WeakRefMap<string, Store<LocalTxKey, TxData>>();
function getTxStore(range: BlockRange) {
	const name = `blocks[${range.start},${range.end}]-txs`;
	let store = txStoreCache.get(name);
	if (!store) {
		store = new Store(LocalTxKey, TxData, { base: BLOCKS_BASE_DIR, name });
		txStoreCache.set(name, store);
	}
	return store;
}

type TxKey = Tuple.Infer<typeof TxKey>;
const TxKey = [u24, u24] as const;

// TODO: Later make this multiple files based on prefix
const txIdIndexStore = new Store([bytes], new Tuple(TxKey), {
	base: DATA_BASE_DIR,
	name: "txId-index",
});

async function getTx(...[blockHeight, txIndex]: TxKey): Promise<TxData | undefined> {
	const blockRange = getBlockRange(blockHeight);
	if (txIndex === 0) {
		// Coinbase tx
		const store = getBlockStore(blockRange);
		const localHeight = blockHeight - blockRange.start;
		const block = (await store.get([localHeight])).at(0);
		return block ? coinbaseDataToTxData(block.coinbase) : undefined;
	}
	const store = getTxStore(blockRange);
	const localHeight = blockHeight - blockRange.start;
	return (await store.get([localHeight, txIndex])).at(0);
}

const TX_INDEX_PREFIX_STEP = 2;
const TX_INDEX_MIN_PREFIX_LENGTH = 8;
async function indexTxByTxId(tx: TxData, ...[blockHeight, txIndex]: TxKey) {
	// Last prefix is the shortest one
	const prefixes: [Uint8Array][] = [];
	for (let length = tx.txId.length; length >= TX_INDEX_MIN_PREFIX_LENGTH; length -= TX_INDEX_PREFIX_STEP) {
		prefixes.push([tx.txId.subarray(0, length)]);
	}

	const existingMatches = await txIdIndexStore.getMany(prefixes);
	if (existingMatches.length > 1) {
		console.error("Multiple existing matches for txId prefix:", {
			blockHeight,
			txIndex,
			txId: bytesToHex(tx.txId.toReversed()),
		});
		throw new Error("Unexpected multiple entries for txId prefixes, this should never happen");
	}
	const existingMatch = existingMatches[0];

	if (!existingMatch) {
		// No collision, safe to add
		await txIdIndexStore.set(prefixes.at(-1)!, [blockHeight, txIndex]);
		return;
	} // Collision, need to resolve

	const [existingPrefix, [existingBlockHeight, existingTxIndex]] = existingMatch;
	if (existingBlockHeight === blockHeight && existingTxIndex === txIndex) {
		// Same entry, nothing to do
		return;
	}

	const existingTx = await getTx(existingBlockHeight, existingTxIndex);
	if (!existingTx) {
		console.error("Cannot find existing tx", { existingBlockHeight, existingTxIndex });
		throw new Error("Inconsistent state: existing tx not found");
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
	await txIdIndexStore.set([newPrefix], [blockHeight, txIndex]);
	await txIdIndexStore.set([newExistingPrefix], [existingBlockHeight, existingTxIndex]);

	// Remove the old prefixes
	await txIdIndexStore.delete(existingPrefix);
}

type TxIndexResult = {
	key: TxKey;
	data: TxData;
};
async function getTxByTxId(txId: Uint8Array): Promise<TxIndexResult | undefined> {
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
	const [, key] = match;

	const data = await getTx(...key);
	if (!data) {
		const [blockHeight, txIndex] = key;
		console.error("Inconsistent state: txId index points to non-existing tx", { blockHeight, txIndex });
		throw new Error("Inconsistent state: txId index points to non-existing tx");
	}

	if (!equals(data.txId, txId)) {
		return undefined; // Not the tx we are looking for
	}

	return { key, data };
}

export async function saveBlock(blockHeight: number, block: Block) {
	const range = getBlockRange(blockHeight);
	const blockStore = getBlockStore(range);
	const txStore = getTxStore(range);

	const localHeight = blockHeight - range.start;
	const existing = (await blockStore.get([localHeight])).at(0);
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
	const coinbaseTxData: TxData = coinbaseDataToTxData(coinbase);
	await txStore.set([localHeight, 0], coinbaseTxData);
	await indexTxByTxId(coinbaseTxData, blockHeight, 0);

	for (const [txIndex, tx] of block.txs.entries().drop(1)) {
		const txId = getTxId(tx);
		const vin: TxInData[] = [];
		for (const vinEntry of tx.vin) {
			const utxoTx = await getTxByTxId(vinEntry.txId);
			if (!utxoTx) {
				console.log("Missing txId:", bytesToHex(vinEntry.txId.toReversed()));
				throw new Error("Referenced UTXO transaction not found");
			}
			const { key: [utxoBlockHeight, utxoTxIndex] } = utxoTx;

			// TODO: Verify that the output is not already spent

			vin.push({
				utxoBlockHeight,
				utxoTxIndex,
				vout: vinEntry.vout,
				sequence: SequenceLock.encode(vinEntry.sequenceLock),
				scriptSig: vinEntry.scriptSig,
			});
		}

		const txData: TxData = {
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

		await txStore.set([localHeight, txIndex], txData);
		await indexTxByTxId(txData, blockHeight, txIndex);
	}

	const { header } = block;
	const blockData: BlockData = { header, coinbase };
	await blockStore.set([localHeight], blockData);
}
