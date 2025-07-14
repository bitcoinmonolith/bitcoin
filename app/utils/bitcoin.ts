import { sha256 } from "@noble/hashes/sha2";
import { Tx } from "../types/Tx.ts";
import { bytesConcat } from "./bytes.ts";
import { encodeVarInt } from "./encoding.ts";

// Detect script type
export function detectInputType(scriptPubKey: Uint8Array) {
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

// Input/output serialization
function serializeInput(input: Tx.Input, overrideScript?: Uint8Array): Uint8Array {
	const script = overrideScript ?? input.scriptSig;

	const voutBuf = new Uint8Array(4);
	new DataView(voutBuf.buffer).setUint32(0, input.vout, true);

	const seqBuf = new Uint8Array(4);
	new DataView(seqBuf.buffer).setUint32(0, input.sequence, true);

	return bytesConcat(
		input.txid.slice().reverse(),
		voutBuf,
		encodeVarInt(script.length),
		script,
		seqBuf,
	);
}

function serializeOutput(output: Tx.Output): Uint8Array {
	const valBuf = new Uint8Array(8);
	new DataView(valBuf.buffer).setBigUint64(0, output.value, true);

	return bytesConcat(
		valBuf,
		encodeVarInt(output.scriptPubKey.length),
		output.scriptPubKey,
	);
}

export function computeSighash(
	tx: Tx,
	inputIndex: number,
	utxos: Tx.Output[],
	sighashType: number,
	scriptCodeOverride?: Uint8Array,
): Uint8Array {
	const utxo = utxos[tx.inputs[inputIndex]!.vout]!;
	const scriptPubKey = utxo.scriptPubKey;
	const value = utxo.value;
	const { type, category } = detectInputType(scriptPubKey);

	if (category === "taproot") {
		return computeSighashTaproot(tx, inputIndex, utxos, 0x00, sighashType);
	}

	if (category === "segwit") {
		// Provide scriptCode for P2WPKH
		let scriptCode = scriptCodeOverride;
		if (!scriptCode) {
			if (type === "p2wpkh" && scriptPubKey.length === 22) {
				const pubkeyHash = scriptPubKey.slice(2);
				scriptCode = new Uint8Array([
					0x76,
					0xa9,
					0x14,
					...pubkeyHash,
					0x88,
					0xac,
				]);
			} else if (type === "p2wsh") {
				if (!scriptCodeOverride) {
					throw new Error("scriptCode required for P2WSH input");
				}
				scriptCode = scriptCodeOverride;
			} else {
				throw new Error(`Unsupported SegWit input type: ${type}`);
			}
		}

		return computeSighashSegwit(tx, inputIndex, scriptCode, value, sighashType);
	}

	// Legacy or nonstandard (default to legacy sighash)
	const scriptCode = scriptCodeOverride ?? scriptPubKey;
	return computeSighashLegacy(tx, inputIndex, scriptCode, sighashType);
}

// Legacy sighash
export function computeSighashLegacy(
	tx: Tx,
	inputIndex: number,
	scriptCode: Uint8Array,
	sighashType: number,
): Uint8Array {
	const versionBuf = new Uint8Array(4);
	new DataView(versionBuf.buffer).setUint32(0, tx.version, true);

	const locktimeBuf = new Uint8Array(4);
	new DataView(locktimeBuf.buffer).setUint32(0, tx.locktime, true);

	const typeBuf = new Uint8Array(4);
	new DataView(typeBuf.buffer).setUint32(0, sighashType, true);

	const inputs = tx.inputs.map((input, i) =>
		serializeInput(input, i === inputIndex ? scriptCode : new Uint8Array([]))
	);

	const outputs = tx.outputs.map(serializeOutput);

	const preimage = bytesConcat(
		versionBuf,
		encodeVarInt(tx.inputs.length),
		...inputs,
		encodeVarInt(tx.outputs.length),
		...outputs,
		locktimeBuf,
		typeBuf,
	);

	return sha256(sha256(preimage));
}

// SegWit v0 sighash
export function computeSighashSegwit(
	tx: Tx,
	inputIndex: number,
	scriptCode: Uint8Array,
	value: bigint,
	sighashType: number,
): Uint8Array {
	const versionBuf = new Uint8Array(4);
	new DataView(versionBuf.buffer).setUint32(0, tx.version, true);

	const locktimeBuf = new Uint8Array(4);
	new DataView(locktimeBuf.buffer).setUint32(0, tx.locktime, true);

	const typeBuf = new Uint8Array(4);
	new DataView(typeBuf.buffer).setUint32(0, sighashType, true);

	const hashPrevouts = sha256(sha256(bytesConcat(
		...tx.inputs.map((input) => {
			const voutBuf = new Uint8Array(4);
			new DataView(voutBuf.buffer).setUint32(0, input.vout, true);
			return bytesConcat(input.txid.slice().reverse(), voutBuf);
		}),
	)));

	const hashSequence = sha256(sha256(bytesConcat(
		...tx.inputs.map((input) => {
			const seqBuf = new Uint8Array(4);
			new DataView(seqBuf.buffer).setUint32(0, input.sequence, true);
			return seqBuf;
		}),
	)));

	const hashOutputs = sha256(sha256(bytesConcat(
		...tx.outputs.map(serializeOutput),
	)));

	const input = tx.inputs[inputIndex]!;
	const voutBuf = new Uint8Array(4);
	new DataView(voutBuf.buffer).setUint32(0, input.vout, true);

	const valBuf = new Uint8Array(8);
	new DataView(valBuf.buffer).setBigUint64(0, value, true);

	const seqBuf = new Uint8Array(4);
	new DataView(seqBuf.buffer).setUint32(0, input.sequence, true);

	const preimage = bytesConcat(
		versionBuf,
		hashPrevouts,
		hashSequence,
		input.txid.slice().reverse(),
		voutBuf,
		encodeVarInt(scriptCode.length),
		scriptCode,
		valBuf,
		seqBuf,
		hashOutputs,
		locktimeBuf,
		typeBuf,
	);

	return sha256(sha256(preimage));
}

// Tagged hash (BIP340-style)
export function taggedHash(tag: string, msg: Uint8Array): Uint8Array {
	const tagHash = sha256(new TextEncoder().encode(tag));
	return sha256(bytesConcat(tagHash, tagHash, msg));
}

// Taproot sighash (key path)
export function computeSighashTaproot(
	tx: Tx,
	inputIndex: number,
	utxos: Tx.Output[],
	spendType: 0x00 | 0x01 = 0x00,
	sighashType = 0x00,
): Uint8Array {
	const versionBuf = new Uint8Array(4);
	new DataView(versionBuf.buffer).setUint32(0, tx.version, true);

	const locktimeBuf = new Uint8Array(4);
	new DataView(locktimeBuf.buffer).setUint32(0, tx.locktime, true);

	const inputIndexBuf = new Uint8Array(4);
	new DataView(inputIndexBuf.buffer).setUint32(0, inputIndex, true);

	const spendTypeBuf = new Uint8Array([spendType]);
	const sighashTypeBuf = new Uint8Array([sighashType]);

	const hashPrevouts = sha256(sha256(bytesConcat(
		...tx.inputs.map((i) => {
			const voutBuf = new Uint8Array(4);
			new DataView(voutBuf.buffer).setUint32(0, i.vout, true);
			return bytesConcat(i.txid.slice().reverse(), voutBuf);
		}),
	)));

	const hashAmounts = sha256(sha256(bytesConcat(
		...utxos.map((out) => {
			const valBuf = new Uint8Array(8);
			new DataView(valBuf.buffer).setBigUint64(0, out.value, true);
			return valBuf;
		}),
	)));

	const hashScriptPubKeys = sha256(sha256(bytesConcat(
		...utxos.map((out) =>
			bytesConcat(
				encodeVarInt(out.scriptPubKey.length),
				out.scriptPubKey,
			)
		),
	)));

	const hashSequences = sha256(sha256(bytesConcat(
		...tx.inputs.map((i) => {
			const seqBuf = new Uint8Array(4);
			new DataView(seqBuf.buffer).setUint32(0, i.sequence, true);
			return seqBuf;
		}),
	)));

	const hashOutputs = sha256(sha256(bytesConcat(
		...tx.outputs.map(serializeOutput),
	)));

	const preimage = bytesConcat(
		spendTypeBuf,
		versionBuf,
		locktimeBuf,
		hashPrevouts,
		hashAmounts,
		hashScriptPubKeys,
		hashSequences,
		hashOutputs,
		inputIndexBuf,
		sighashTypeBuf,
	);

	return taggedHash("TapSighash", preimage);
}
