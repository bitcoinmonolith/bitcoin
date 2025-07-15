import { verify } from "@noble/secp256k1";
import { bytesConcat, bytesEqual } from "../utils/bytes.ts";
import { sha256 } from "@noble/hashes/sha2";
import { BIP_112_PRE_SEGWIT_OPCODE_TABLE } from "./BIP_112_PRE_SEGWIT.ts";
import { OPCODE_DUPLICATES, OPCODE_TABLE } from "./GENESIS.ts";
import { Tx } from "../types/Tx.ts";

export const BIP_141_SEGWIT_ACTIVATION_HEIGHT = 481824; // Mainnet activation height for BIP 141 (SegWit)

// BIP143 sighash flags
const SIGHASH_ALL = 0x01;
const SIGHASH_NONE = 0x02;
const SIGHASH_SINGLE = 0x03;
const SIGHASH_ANYONECANPAY = 0x80;

type ThisModule = typeof import("./BIP_141_SEGWIT.ts");
type OP_CODES = Pick<ThisModule, keyof ThisModule & `OP_${string}`>;
// Ensure that OP_CODES has unique values
({} as OPCODE_DUPLICATES<OP_CODES>) satisfies never;

export const BIP_141_SEGWIT_OPCODE_TABLE: OPCODE_TABLE = [...BIP_112_PRE_SEGWIT_OPCODE_TABLE];

// BIP143 defines the new transaction digest algorithm for SegWit transactions
async function sigHashTxDigest(tx: Tx, inputIndex: number, sighashType: number): Promise<Uint8Array> {
	// Handle different sighash types
	const hashPrevouts = (sighashType & SIGHASH_ANYONECANPAY)
		? new Uint8Array(32).fill(0)
		: sha256(sha256(bytesConcat(...tx.inputs.map((input) =>
			bytesConcat(input.txid, new Uint8Array(new Uint32Array([input.vout]).buffer))
		))));

	const hashSequence = ((sighashType & SIGHASH_ANYONECANPAY) ||
			(sighashType & 0x1f) === SIGHASH_SINGLE ||
			(sighashType & 0x1f) === SIGHASH_NONE)
		? new Uint8Array(32).fill(0)
		: sha256(
			sha256(bytesConcat(...tx.inputs.map((input) => new Uint8Array(new Uint32Array([input.sequence]).buffer)))),
		);

	const hashOutputs = (sighashType & 0x1f) === SIGHASH_SINGLE && inputIndex < tx.outputs.length
		? sha256(sha256(bytesConcat(
			new Uint8Array(new BigUint64Array([tx.outputs[inputIndex]!.value]).buffer),
			tx.outputs[inputIndex]!.scriptPubKey,
		)))
		: (sighashType & 0x1f) === SIGHASH_NONE
		? new Uint8Array(32).fill(0)
		: sha256(sha256(bytesConcat(...tx.outputs.map((output) =>
			bytesConcat(
				new Uint8Array(new BigUint64Array([output.value]).buffer),
				output.scriptPubKey,
			)
		))));

	return sha256(bytesConcat(
		// Version
		new Uint8Array(new Int32Array([tx.version]).buffer),
		// Hash of all input outpoints
		hashPrevouts,
		// Hash of all input sequences
		hashSequence,
		// The current input being checked
		tx.inputs[inputIndex]!.txid,
		new Uint8Array(new Uint32Array([tx.inputs[inputIndex]!.vout]).buffer),
		// Previous output script and value
		await tx.inputs[inputIndex]!.prevOutput.then((out) =>
			bytesConcat(
				out.scriptPubKey,
				new Uint8Array(new BigUint64Array([out.value]).buffer),
			)
		),
		new Uint8Array(new Uint32Array([tx.inputs[inputIndex]!.sequence]).buffer),
		// Hash of all outputs
		hashOutputs,
		// Locktime and sighash type
		new Uint8Array(new Uint32Array([tx.locktime]).buffer),
		new Uint8Array([sighashType]),
	));
}

export const OP_CHECKSIG = 0xac; // uses BIP143 signature hashing algorithm
BIP_141_SEGWIT_OPCODE_TABLE[OP_CHECKSIG] = async ({ stack, tx, inputIndex }) => {
	if (stack.length < 2) {
		throw new Error("OP_CHECKSIG: Stack underflow");
	}
	const pubkey = stack.pop()!;
	const sig = stack.pop()!;

	// Get sighash type from last byte
	const sighashType = sig[sig.length - 1]!;
	const signature = sig.slice(0, -1);

	const sigHash = await sigHashTxDigest(tx, inputIndex, sighashType);
	const result = verify(signature, sigHash, pubkey);
	stack.push(result ? new Uint8Array([1]) : new Uint8Array([]));
};

export const OP_CHECKSIGVERIFY = 0xad; // same, with VERIFY
BIP_141_SEGWIT_OPCODE_TABLE[OP_CHECKSIGVERIFY] = (context) => {
	BIP_141_SEGWIT_OPCODE_TABLE[OP_CHECKSIG]!(context);
	const top = context.stack.pop();
	if (!top) {
		throw new Error("OP_CHECKSIGVERIFY: Stack underflow");
	}
	if (bytesEqual(top, new Uint8Array([]))) {
		throw new Error("OP_CHECKSIGVERIFY: Signature verification failed");
	}
};

export const OP_CHECKMULTISIG = 0xae; // uses BIP143 signature hashing algorithm
BIP_141_SEGWIT_OPCODE_TABLE[OP_CHECKMULTISIG] = async ({ stack, tx, inputIndex }) => {
	if (stack.length < 1) {
		throw new Error("OP_CHECKMULTISIG: Stack underflow");
	}
	const n = stack.pop()!;
	if (n[0]! < 0 || n[0]! > stack.length) {
		throw new Error("OP_CHECKMULTISIG: Invalid number of signatures");
	}

	const pubkeys = [];
	for (let i = 0; i < n[0]!; i++) {
		const pubkey = stack.pop();
		if (!pubkey) {
			throw new Error("OP_CHECKMULTISIG: Stack underflow while popping public key");
		}
		pubkeys.push(pubkey);
	}

	if (stack.length < 1) {
		throw new Error("OP_CHECKMULTISIG: Stack underflow");
	}
	const m = stack.pop()!;
	if (m[0]! < 0 || m[0]! > stack.length) {
		throw new Error("OP_CHECKMULTISIG: Invalid number of public keys");
	}

	const sigs = [];
	for (let i = 0; i < m[0]!; i++) {
		const sig = stack.pop();
		if (!sig) {
			throw new Error("OP_CHECKMULTISIG: Stack underflow while popping signature");
		}
		sigs.push(sig);
	}

	// No more dummy element consumed in SegWit - fixed the off-by-one bug

	let sigIndex = 0;
	let success = true;

	for (const sig of sigs) {
		// Get sighash type from last byte
		const sighashType = sig[sig.length - 1]!;
		const signature = sig.slice(0, -1);

		let found = false;
		while (sigIndex < pubkeys.length) {
			const pubkey = pubkeys[sigIndex]!;
			sigIndex++;
			try {
				const sigHash = await sigHashTxDigest(tx, inputIndex, sighashType);
				if (verify(signature, sigHash, pubkey)) {
					found = true;
					break;
				}
			} catch {
				continue;
			}
		}
		if (!found) {
			success = false;
			break;
		}
	}

	stack.push(success ? new Uint8Array([1]) : new Uint8Array([]));
};

export const OP_CHECKMULTISIGVERIFY = 0xaf; // same
BIP_141_SEGWIT_OPCODE_TABLE[OP_CHECKMULTISIGVERIFY] = (context) => {
	BIP_141_SEGWIT_OPCODE_TABLE[OP_CHECKMULTISIG]!(context);
	const top = context.stack.pop();
	if (!top) {
		throw new Error("OP_CHECKMULTISIGVERIFY: Stack underflow");
	}
	if (bytesEqual(top, new Uint8Array([]))) {
		throw new Error("OP_CHECKMULTISIGVERIFY: Signature verification failed");
	} else if (top[0]! === 0) {
		throw new Error("OP_CHECKMULTISIGVERIFY: No signatures were verified");
	} else if (top[0]! < 0) {
		throw new Error("OP_CHECKMULTISIGVERIFY: Negative signature count");
	} else if (top[0]! > context.stack.length) {
		throw new Error("OP_CHECKMULTISIGVERIFY: Too many signatures");
	}
};

// OP_CODESEPARATOR becomes a NOP in SegWit v0
export const OP_CODESEPARATOR = 0xab; // becomes NO-OP (ignored) in SegWit v0
BIP_141_SEGWIT_OPCODE_TABLE[OP_CODESEPARATOR] = () => {};
