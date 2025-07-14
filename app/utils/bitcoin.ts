import { sha256 } from "@noble/hashes/sha2";
import { bytesConcat } from "./bytes.ts";
import { Tx } from "../types/Tx.ts";

export function taggedHash(tag: string, msg: Uint8Array): Uint8Array {
	const tagHash = sha256(new TextEncoder().encode(tag));
	return sha256(bytesConcat(tagHash, tagHash, msg));
}

// Detect script type
export function detectScriptPubKeyType(scriptPubKey: Uint8Array) {
	// P2PKH: OP_DUP OP_HASH160 PUSH(20) <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
	if (
		scriptPubKey.length === 25 &&
		scriptPubKey[0] === 0x76 &&
		scriptPubKey[1] === 0xa9 &&
		scriptPubKey[2] === 0x14 &&
		scriptPubKey[23] === 0x88 &&
		scriptPubKey[24] === 0xac
	) {
		return { type: "p2pkh", category: "legacy" } as const;
	}

	// P2SH: OP_HASH160 PUSH(20) <scriptHash> OP_EQUAL
	if (
		scriptPubKey.length === 23 &&
		scriptPubKey[0] === 0xa9 &&
		scriptPubKey[1] === 0x14 &&
		scriptPubKey[22] === 0x87
	) {
		return { type: "p2sh", category: "legacy" } as const;
	}

	// IsWitnessProgram()
	if (scriptPubKey.length >= 4 && scriptPubKey.length <= 42) {
		const versionByte = scriptPubKey[0]!;
		const pushLength = scriptPubKey[1]!;

		if (
			(versionByte === 0x00 || (versionByte >= 0x51 && versionByte <= 0x60)) &&
			pushLength === scriptPubKey.length - 2
		) {
			const version = versionByte === 0x00 ? 0 : versionByte - 0x50;

			if (version === 0) {
				if (pushLength === 20) return { type: "p2wpkh", category: "segwit" } as const;
				if (pushLength === 32) return { type: "p2wsh", category: "segwit" } as const;
			} else if (version === 1 && pushLength === 32) {
				return { type: "p2tr", category: "taproot" } as const;
			}
		}
	}

	return { type: "nonstandard", category: "nonstandard" } as const;
}

export async function computeSighash(
	tx: Tx,
	inputIndex: number,
	subscript: Uint8Array,
	sighashType: number,
): Promise<Uint8Array> {
	const { category } = detectScriptPubKeyType(subscript);

	switch (category) {
		case "legacy":
			return computeSighashLegacy(tx, inputIndex, subscript, sighashType);
		case "segwit":
			return await computeSighashSegwit(tx, inputIndex, subscript, sighashType);
		case "taproot":
			return await computeSighashTaproot(tx, inputIndex, subscript, sighashType);
		default:
			return computeSighashLegacy(tx, inputIndex, subscript, sighashType);
	}
}

export function computeSighashLegacy(
	tx: Tx,
	inputIndex: number,
	subscript: Uint8Array,
	sighashType: number,
): Uint8Array {
	// Handle different SIGHASH types
	const txCopy = { ...tx };

	const type = sighashType & 0x1f;
	const anyoneCanPay = (sighashType & 0x80) === 0x80;

	// Handle inputs based on sighash flags
	if (anyoneCanPay) {
		txCopy.inputs = [{ ...tx.inputs[inputIndex]!, scriptSig: subscript }];
	} else {
		txCopy.inputs = tx.inputs.map((input, i) => ({
			...input,
			scriptSig: i === inputIndex ? subscript : new Uint8Array(),
		}));
	}

	// Handle outputs based on sighash type
	if (type === 0x02) { // SIGHASH_NONE
		txCopy.outputs = [];
		// Set sequence numbers to 0 except current input
		txCopy.inputs = txCopy.inputs.map((input, i) => ({
			...input,
			sequence: i === inputIndex ? input.sequence : 0,
		}));
	} else if (type === 0x03) { // SIGHASH_SINGLE
		if (inputIndex >= tx.outputs.length) {
			throw new Error("SIGHASH_SINGLE index out of range");
		}
		txCopy.outputs = tx.outputs.slice(0, inputIndex + 1).map((output, i) =>
			i === inputIndex ? output : { value: 0n, scriptPubKey: new Uint8Array() }
		);
		// Set sequence numbers to 0 except current input
		txCopy.inputs = txCopy.inputs.map((input, i) => ({
			...input,
			sequence: i === inputIndex ? input.sequence : 0,
		}));
	}

	const preimage = Tx.serialize([txCopy]);
	const withType = bytesConcat(preimage, new Uint8Array([sighashType & 0xff]));
	return sha256(sha256(withType));
}

export async function computeSighashSegwit(
	tx: Tx,
	inputIndex: number,
	subscript: Uint8Array,
	sighashType: number,
): Promise<Uint8Array> {
	const hashPrevouts = (sighashType & 0x1f) !== 0x01
		? sha256(sha256(bytesConcat(
			...tx.inputs.map((input) =>
				bytesConcat(
					input.txid,
					new Uint8Array(new Uint32Array([input.vout]).buffer),
				)
			),
		)))
		: new Uint8Array(32); // Zero hash if SIGHASH_SINGLE or SIGHASH_NONE

	const hashSequence = (sighashType & 0x1f) !== 0x01 && (sighashType & 0x80) !== 0x80
		? sha256(sha256(bytesConcat(
			...tx.inputs.map((input) => new Uint8Array(new Uint32Array([input.sequence]).buffer)),
		)))
		: new Uint8Array(32); // Zero hash if SIGHASH_SINGLE, SIGHASH_NONE, or ANYONECANPAY

	const hashOutputs = (() => {
		const type = sighashType & 0x1f;
		if (type === 0x02) { // SIGHASH_NONE
			return new Uint8Array(32);
		}
		if (type === 0x03 && inputIndex < tx.outputs.length) { // SIGHASH_SINGLE
			const output = tx.outputs[inputIndex]!;
			return sha256(sha256(bytesConcat(
				new Uint8Array(new BigUint64Array([output.value]).buffer),
				new Uint8Array([output.scriptPubKey.length]),
				output.scriptPubKey,
			)));
		}
		return sha256(sha256(bytesConcat(
			...tx.outputs.map((output) =>
				bytesConcat(
					new Uint8Array(new BigUint64Array([output.value]).buffer),
					new Uint8Array([output.scriptPubKey.length]),
					output.scriptPubKey,
				)
			),
		)));
	})();

	const input = tx.inputs[inputIndex]!;
	const prevOutput = await input.prevOutput;

	const preimage = bytesConcat(
		new Uint8Array(new Int32Array([tx.version]).buffer),
		hashPrevouts,
		hashSequence,
		input.txid,
		new Uint8Array(new Uint32Array([input.vout]).buffer),
		new Uint8Array([subscript.length]),
		subscript,
		new Uint8Array(new BigUint64Array([prevOutput.value]).buffer), // Use actual amount
		new Uint8Array(new Uint32Array([input.sequence]).buffer),
		hashOutputs,
		new Uint8Array(new Uint32Array([tx.locktime]).buffer),
		new Uint8Array([sighashType & 0xff]),
	);

	return sha256(sha256(preimage));
}

export async function computeSighashTaproot(
	tx: Tx,
	inputIndex: number,
	subscript: Uint8Array,
	sighashType: number,
): Promise<Uint8Array> {
	// Calculate hash of all outpoints
	const hashPrevouts = sha256(sha256(bytesConcat(
		...tx.inputs.map((input) =>
			bytesConcat(
				input.txid,
				new Uint8Array(new Uint32Array([input.vout]).buffer),
			)
		),
	)));

	// Calculate hash of amounts
	const amounts = await Promise.all(tx.inputs.map(async (input) => {
		const prevOutput = await input.prevOutput;
		return new Uint8Array(new BigUint64Array([prevOutput.value]).buffer);
	}));
	const hashAmounts = sha256(sha256(bytesConcat(...amounts)));

	// Calculate hash of scriptPubKeys
	const scriptPubKeys = await Promise.all(tx.inputs.map(async (input) => {
		const prevOutput = await input.prevOutput;
		return bytesConcat(
			new Uint8Array([prevOutput.scriptPubKey.length]),
			prevOutput.scriptPubKey,
		);
	}));
	const hashScriptPubKeys = sha256(sha256(bytesConcat(...scriptPubKeys)));

	// Calculate hash of sequences
	const hashSequences = sha256(sha256(bytesConcat(
		...tx.inputs.map((input) => new Uint8Array(new Uint32Array([input.sequence]).buffer)),
	)));

	// Calculate hash of outputs
	const hashOutputs = sha256(sha256(bytesConcat(
		...tx.outputs.map((output) =>
			bytesConcat(
				new Uint8Array(new BigUint64Array([output.value]).buffer),
				new Uint8Array([output.scriptPubKey.length]),
				output.scriptPubKey,
			)
		),
	)));

	const version = new Uint8Array(new Int32Array([tx.version]).buffer);
	const locktime = new Uint8Array(new Uint32Array([tx.locktime]).buffer);

	const input = tx.inputs[inputIndex]!;
	const outpoint = bytesConcat(
		input.txid,
		new Uint8Array(new Uint32Array([input.vout]).buffer),
	);

	const prevOutput = await input.prevOutput;

	// Get annex if present (from witness)
	let annex: Uint8Array = new Uint8Array([0]); // Default no annex
	if (input.witness && input.witness.length > 0) {
		const lastWitness = input.witness[input.witness.length - 1];
		if (lastWitness && lastWitness[0] === 0x50) {
			annex = bytesConcat(
				new Uint8Array([1]),
				sha256(lastWitness),
			);
		}
	}

	return taggedHash(
		"TapSighash",
		bytesConcat(
			hashPrevouts,
			hashAmounts,
			hashScriptPubKeys,
			hashSequences,
			hashOutputs,
			new Uint8Array([sighashType & 0xff]),
			version,
			locktime,
			outpoint,
			subscript,
			new Uint8Array(new BigUint64Array([prevOutput.value]).buffer),
			new Uint8Array(new Uint32Array([input.sequence]).buffer),
			annex,
		),
	);
}
