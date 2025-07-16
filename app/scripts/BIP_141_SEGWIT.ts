import { sha256 } from "@noble/hashes/sha2";
import { verify } from "@noble/secp256k1";
import { concat } from "jsr:@std/bytes";
import { Tx } from "../types/Tx.ts";
import { BIP_112_PRE_SEGWIT_OPCODE_TABLE } from "./BIP_112_PRE_SEGWIT.ts";
import { OPCODE_DUPLICATES, OPCODE_TABLE } from "./GENESIS.ts";

// BIP143 sighash flags
const SIGHASH_ALL = 0x01;
const SIGHASH_NONE = 0x02;
const SIGHASH_SINGLE = 0x03;
const SIGHASH_ANYONECANPAY = 0x80;

export const BIP_141_SEGWIT_ACTIVATION_HEIGHT = 481824;

type ThisModule = typeof import("./BIP_141_SEGWIT.ts");
type OP_CODES = Pick<ThisModule, keyof ThisModule & `OP_${string}`>;
({} as OPCODE_DUPLICATES<OP_CODES>) satisfies never;

export const BIP_141_SEGWIT_OPCODE_TABLE: OPCODE_TABLE = [...BIP_112_PRE_SEGWIT_OPCODE_TABLE];

async function sigHashTxDigest(tx: Tx, inputIndex: number, sighashType: number): Promise<Uint8Array> {
	const baseType = sighashType & 0x1f;
	const anyoneCanPay = (sighashType & SIGHASH_ANYONECANPAY) !== 0;

	// --- hashPrevouts ---
	let hashPrevouts: Uint8Array;
	if (anyoneCanPay) {
		hashPrevouts = new Uint8Array(32).fill(0);
	} else {
		hashPrevouts = sha256(sha256(concat(
			tx.inputs.flatMap((input) => [
				input.txid.toReversed(),
				new Uint8Array(new Uint32Array([input.vout]).buffer),
			]),
		)));
	}

	// --- hashSequence ---
	let hashSequence: Uint8Array;
	if (anyoneCanPay || baseType === SIGHASH_SINGLE || baseType === SIGHASH_NONE) {
		hashSequence = new Uint8Array(32).fill(0);
	} else {
		hashSequence = sha256(sha256(concat(
			tx.inputs.map((input) => new Uint8Array(new Uint32Array([input.sequence]).buffer)),
		)));
	}

	// --- hashOutputs ---
	let hashOutputs: Uint8Array;

	if (baseType === SIGHASH_ALL) {
		hashOutputs = sha256(sha256(concat(
			tx.outputs.flatMap((output) => [
				new Uint8Array(new BigUint64Array([output.value]).buffer),
				output.scriptPubKey,
			]),
		)));
	} else if (baseType === SIGHASH_SINGLE) {
		if (inputIndex >= tx.outputs.length) {
			throw new Error("SIGHASH_SINGLE but inputIndex >= outputs.length");
		}
		const output = tx.outputs[inputIndex]!;
		hashOutputs = sha256(sha256(concat([
			new Uint8Array(new BigUint64Array([output.value]).buffer),
			output.scriptPubKey,
		])));
	} else if (baseType === SIGHASH_NONE) {
		hashOutputs = new Uint8Array(32).fill(0);
	} else {
		throw new Error(`Unknown sighash type: ${baseType}`);
	}

	// --- assemble final digest ---
	const input = tx.inputs[inputIndex]!;
	const prevOutput = await input.prevOutput;

	return sha256(concat([
		new Uint8Array(new Int32Array([tx.version]).buffer),
		hashPrevouts,
		hashSequence,
		input.txid.toReversed(),
		new Uint8Array(new Uint32Array([input.vout]).buffer),
		prevOutput.scriptPubKey,
		new Uint8Array(new BigUint64Array([prevOutput.value]).buffer),
		new Uint8Array(new Uint32Array([input.sequence]).buffer),
		hashOutputs,
		new Uint8Array(new Uint32Array([tx.locktime]).buffer),
		new Uint8Array([sighashType]),
	]));
}

export const OP_CHECKSIG = 0xac;
BIP_141_SEGWIT_OPCODE_TABLE[OP_CHECKSIG] = async ({ stack, tx, inputIndex }) => {
	if (stack.length < 2) throw new Error("OP_CHECKSIG: Stack underflow");

	const pubkey = stack.pop()!;
	const sigWithHashType = stack.pop()!;

	const sighashType = sigWithHashType[sigWithHashType.length - 1]!;
	const signature = sigWithHashType.slice(0, -1);

	const sigHash = await sigHashTxDigest(tx, inputIndex, sighashType);
	const result = verify(signature, sigHash, pubkey);

	stack.push(result ? new Uint8Array([1]) : new Uint8Array([]));
};

export const OP_CHECKSIGVERIFY = 0xad;
BIP_141_SEGWIT_OPCODE_TABLE[OP_CHECKSIGVERIFY] = async (ctx) => {
	await ctx.table[OP_CHECKSIG]!(ctx);

	const top = ctx.stack.pop();
	if (!top || top.length === 0 || top[0] === 0) {
		throw new Error("OP_CHECKSIGVERIFY: Signature verification failed");
	}
};

export const OP_CHECKMULTISIG = 0xae;
BIP_141_SEGWIT_OPCODE_TABLE[OP_CHECKMULTISIG] = async ({ stack, tx, inputIndex }) => {
	if (stack.length < 1) throw new Error("OP_CHECKMULTISIG: Stack underflow");

	const m = stack.pop()!;
	const mVal = m[0]!;
	if (mVal < 0 || mVal > stack.length) throw new Error("OP_CHECKMULTISIG: Invalid pubkey count");

	const pubkeys = [];
	for (let i = 0; i < mVal; i++) {
		const pubkey = stack.pop();
		if (!pubkey) throw new Error("OP_CHECKMULTISIG: Stack underflow while popping pubkey");
		pubkeys.push(pubkey);
	}

	if (stack.length < 1) throw new Error("OP_CHECKMULTISIG: Stack underflow");

	const n = stack.pop()!;
	const nVal = n[0]!;
	if (nVal < 0 || nVal > stack.length) throw new Error("OP_CHECKMULTISIG: Invalid signature count");

	const sigs = [];
	for (let i = 0; i < nVal; i++) {
		const sig = stack.pop();
		if (!sig) throw new Error("OP_CHECKMULTISIG: Stack underflow while popping signature");
		sigs.push(sig);
	}

	let sigIndex = 0;
	let pubIndex = 0;
	let success = true;

	for (; sigIndex < sigs.length; sigIndex++) {
		const sig = sigs[sigIndex]!;
		const sighashType = sig[sig.length - 1]!;
		const signature = sig.slice(0, -1);
		let matched = false;

		while (pubIndex < pubkeys.length) {
			const pubkey = pubkeys[pubIndex++]!;
			try {
				const sigHash = await sigHashTxDigest(tx, inputIndex, sighashType);
				if (verify(signature, sigHash, pubkey)) {
					matched = true;
					break;
				}
			} catch {
				// Skip invalid sigs
			}
		}
		if (!matched) {
			success = false;
			break;
		}
	}

	stack.push(success ? new Uint8Array([1]) : new Uint8Array([]));
};

export const OP_CHECKMULTISIGVERIFY = 0xaf;
BIP_141_SEGWIT_OPCODE_TABLE[OP_CHECKMULTISIGVERIFY] = async (ctx) => {
	await ctx.table[OP_CHECKMULTISIG]!(ctx);

	const top = ctx.stack.pop();
	if (!top || top.length === 0 || top[0] === 0) {
		throw new Error("OP_CHECKMULTISIGVERIFY: Signature verification failed");
	}
};

export const OP_CODESEPARATOR = 0xab;
BIP_141_SEGWIT_OPCODE_TABLE[OP_CODESEPARATOR] = () => {
	// No-op in SegWit (BIP 143)
};
