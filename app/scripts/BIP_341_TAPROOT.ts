import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha2";
import { OPCODE_TABLE_BIP_141_SEGWIT } from "./BIP_141_SEGWIT.ts";
import { OPCODE_DUPLICATES, OPCODE_TABLE } from "./GENESIS.ts";

export const BIP_341_TAPROOT_ACTIVATION_HEIGHT = 709632; // Mainnet activation height for BIP 341 (Taproot)

type ThisModule = typeof import("./BIP_341_TAPROOT.ts");
type OP_CODES = Pick<ThisModule, keyof ThisModule & `OP_${string}`>;
// Ensure that OP_CODES has unique values
({} as OPCODE_DUPLICATES<OP_CODES>) satisfies never;

export const OPCODE_TABLE_BIP_341_TAPROOT: OPCODE_TABLE = [...OPCODE_TABLE_BIP_141_SEGWIT];

export const OP_CHECKSIG = 0xac; // uses Schnorr in Tapscript
// Override CHECKSIG for Taproot (using Schnorr)
OPCODE_TABLE_BIP_341_TAPROOT[OP_CHECKSIG] = ({ stack }) => {
	if (stack.length < 2) return false;
	const pubkey = stack.pop()!;
	const sig = stack.pop()!;

	try {
		// In Taproot, we use Schnorr signatures
		const hash = sha256(sig); // Simplified - actual implementation needs proper transaction digest
		const result = schnorr.verify(sig, hash, pubkey);
		stack.push(result ? new Uint8Array([1]) : new Uint8Array([]));
		return true;
	} catch {
		stack.push(new Uint8Array([]));
		return true;
	}
};

export const OP_CHECKSIGADD = 0xba; // new opcode
// Implement new CHECKSIGADD operation
OPCODE_TABLE_BIP_341_TAPROOT[OP_CHECKSIGADD] = ({ stack }) => {
	if (stack.length < 3) return false;
	const pubkey = stack.pop()!;
	const sig = stack.pop()!;
	const num = stack.pop()![0]!;

	try {
		const hash = sha256(sig); // Simplified - actual implementation needs proper transaction digest
		const result = schnorr.verify(sig, hash, pubkey);
		stack.push(new Uint8Array([num + (result ? 1 : 0)]));
		return true;
	} catch {
		stack.push(new Uint8Array([num]));
		return true;
	}
};

// Disable operations not allowed in Taproot
export const OP_CHECKMULTISIG = 0xae;
OPCODE_TABLE_BIP_341_TAPROOT[OP_CHECKMULTISIG] = () => false;

export const OP_CHECKMULTISIGVERIFY = 0xaf;
OPCODE_TABLE_BIP_341_TAPROOT[OP_CHECKMULTISIGVERIFY] = () => false;

export const OP_CODESEPARATOR = 0xab;
OPCODE_TABLE_BIP_341_TAPROOT[OP_CODESEPARATOR] = () => false;
