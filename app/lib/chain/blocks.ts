import { bytesToHex } from "@noble/hashes/utils";
import { bool, bytes, Codec, i32, Struct, Tuple, u16, u32, u64, Vector } from "@nomadshiba/struct-js";
import { equals } from "@std/bytes";
import { join } from "@std/path";
import { BASE_DATA_DIR } from "~/lib/constants.ts";
import { Block } from "~/lib/primitives/Block.ts";
import { bytes32 } from "~/lib/primitives/Bytes32.ts";
import { getTxId } from "~/lib/primitives/Tx.ts";
import { u24 } from "~/lib/primitives/U24.ts";
import { Store } from "~/lib/Store.ts";
import { TimeLock } from "~/lib/primitives/weirdness/TimeLock.ts";
import { SequenceLock } from "~/lib/primitives/weirdness/SequenceLock.ts";

/*
BIP-30 nTime > 1331769600
no block is valid if it contains a txid that already exists, unless the old one is fully spent.

after block 227,835 (March 2013, when BIP-34 hit), coinbase uniqueness is enforced by block height, so this never repeats.
*/

const BIP_30_ENFORCEMENT_TIME = 1331769600;
const BIP_34_ENFORCEMENT_HEIGHT = 227835;

const BLOCKS_PER_CHUNK = 12_500; // About 20GB per chunk with modern blocks
const BLOCKS_BASE_DIR = join(BASE_DATA_DIR, "blocks");

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

type LocalTxKey = Tuple.Infer<typeof LocalTxKey>;
const LocalTxKey = [u16, u24] as const; // Local block height within the chunk, tx index within the block

const txStoreCache: Store<LocalTxKey, TxData>[] = [];
function getTxStore(range: BlockRange) {
	const name = `blocks[${range.start},${range.end}]-txs`;
	const index = range.start / BLOCKS_PER_CHUNK;
	let store = txStoreCache[index];
	if (!store) {
		store = new Store(LocalTxKey, TxData, { base: BLOCKS_BASE_DIR, name });
		txStoreCache[index] = store;
	}
	return store;
}

type LocalBlockKey = Tuple.Infer<typeof LocalBlockKey>;
const LocalBlockKey = [u16] as const; // Local height within the chunk

const blockStoreCache: Store<LocalBlockKey, BlockData>[] = [];
function getBlockStore(range: BlockRange) {
	const name = `blocks[${range.start},${range.end}]`;
	const index = range.start / BLOCKS_PER_CHUNK;
	let store = blockStoreCache[index];
	if (!store) {
		store = new Store(LocalBlockKey, BlockData, { base: BLOCKS_BASE_DIR, name });
		blockStoreCache[index] = store;
	}
	return store;
}

export async function getBlock(blockHeight: number): Promise<BlockData | undefined> {
	const range = getBlockRange(blockHeight);
	const store = getBlockStore(range);
	const localHeight = blockHeight - range.start;
	const res = await store.get([localHeight]);
	return res.at(0);
}

type TxKey = Tuple.Infer<typeof TxKey>;
const TxKey = [u24, u24] as const;

// TODO: Later make this multiple files based on prefix
const txIdIndexStore = new Store([bytes], new Tuple(TxKey), {
	base: BASE_DATA_DIR,
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
		txIdIndexStore.set(prefixes.at(-1)!, [blockHeight, txIndex]);
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

	const existingPrefixLength = existingPrefix[0].byteLength;

	// Find the point where they differ
	let diffIndex = existingPrefixLength;
	while (diffIndex < 32 && tx.txId[diffIndex] === existingTx.txId[diffIndex]) {
		diffIndex++;
	}

	if (diffIndex === 32) {
		console.log(
			`TxId`,
			bytesToHex(tx.txId.toReversed()),
			`exists both at ${blockHeight}:${txIndex} and ${existingBlockHeight}:${existingTxIndex}`,
		);

		console.log("This might be a BIP-30 violation, checking block timestamp for activation...");
		const block = await getBlock(blockHeight);
		if (!block) {
			console.error("Cannot find block for new tx", { blockHeight });
			throw new Error("Inconsistent state: block for new tx not found");
		}

		if (block.header.timestamp >= BIP_30_ENFORCEMENT_TIME) {
			console.error("Acting accordingly to BIP-30 and rejecting the new transaction");
			throw new Error("BIP-30: transaction with duplicate txId");
		}

		console.log("BIP-30 not active yet, accepting the new transaction");
		console.log("This will overwrite the existing transaction in the index");

		txIdIndexStore.set(existingPrefix, [blockHeight, txIndex]);
		return;
	}

	// Remove the old length prefix from the index
	await txIdIndexStore.delete(existingPrefix);

	const newPrefixLength = TX_INDEX_MIN_PREFIX_LENGTH +
		Math.ceil((diffIndex + 1 - TX_INDEX_MIN_PREFIX_LENGTH) / TX_INDEX_PREFIX_STEP) *
			TX_INDEX_PREFIX_STEP;

	// Update the index with the new prefixes
	const newPrefix = tx.txId.subarray(0, newPrefixLength);
	txIdIndexStore.set([newPrefix], [blockHeight, txIndex]);
	const newExistingPrefix = existingTx.txId.subarray(0, newPrefixLength);
	txIdIndexStore.set([newExistingPrefix], [existingBlockHeight, existingTxIndex]);
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

export async function saveBlock(blockHeight: number, block: Block): Promise<void> {
	const range = getBlockRange(blockHeight);
	const blockStore = getBlockStore(range);
	const txStore = getTxStore(range);

	const localHeight = blockHeight - range.start;

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
		lockTime: TimeLock.encode(coinbaseTx.lockTime),
		sequence: SequenceLock.encode(coinbaseTxVin.sequenceLock),
		coinbase: coinbaseTxVin.scriptSig,
		vout: coinbaseTx.vout.map((out): TxOutData => ({
			spent: false,
			value: out.value,
			scriptPubKey: out.scriptPubKey,
		})),
	};

	// Blocks are stored first because txs might try to read the block.
	const { header } = block;
	const blockData: BlockData = { header, coinbase };
	blockStore.set([localHeight], blockData);

	const coinbaseTxData: TxData = coinbaseDataToTxData(coinbase);
	txStore.set([localHeight, 0], coinbaseTxData);
	await indexTxByTxId(coinbaseTxData, blockHeight, 0);

	for (const [txIndex, tx] of block.txs.entries().drop(1)) {
		const txId = getTxId(tx);
		const vin: TxInData[] = [];
		for (const [vinIndex, vinEntry] of tx.vin.entries()) {
			const utxoTx = await getTxByTxId(vinEntry.txId);
			if (!utxoTx) {
				console.log("Input txId:", bytesToHex(txId.toReversed()), "vin:", vinIndex);
				console.log("UTXO txId:", bytesToHex(vinEntry.txId.toReversed()), "vout:", vinEntry.vout);
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
			lockTime: TimeLock.encode(tx.lockTime),
			vin,
			vout: tx.vout.map((out): TxOutData => ({
				spent: false,
				value: out.value,
				scriptPubKey: out.scriptPubKey,
			})),
		};

		txStore.set([localHeight, txIndex], txData);
		await indexTxByTxId(txData, blockHeight, txIndex);
	}
}
