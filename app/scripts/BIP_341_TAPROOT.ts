import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha2";
import { BIP_141_SEGWIT_OPCODE_TABLE } from "./BIP_141_SEGWIT.ts";
import { OPCODE_DUPLICATES, OPCODE_TABLE } from "./GENESIS.ts";

export const BIP_341_TAPROOT_ACTIVATION_HEIGHT = 709632; // Mainnet activation height for BIP 341 (Taproot)

type ThisModule = typeof import("./BIP_341_TAPROOT.ts");
type OP_CODES = Pick<ThisModule, keyof ThisModule & `OP_${string}`>;
// Ensure that OP_CODES has unique values
({} as OPCODE_DUPLICATES<OP_CODES>) satisfies never;

export const BIP_341_TAPROOT_OPCODE_TABLE: OPCODE_TABLE = [...BIP_141_SEGWIT_OPCODE_TABLE];

export const OP_CHECKSIG = 0xac; // uses Schnorr in Tapscript
// Override CHECKSIG for Taproot (using Schnorr)
BIP_341_TAPROOT_OPCODE_TABLE[OP_CHECKSIG] = ({ stack }) => {
	if (stack.length < 2) {
		throw new Error("OP_CHECKSIG: Stack underflow");
	}
	const pubkey = stack.pop()!;
	const sig = stack.pop()!;

	// In Taproot, we use Schnorr signatures
	const hash = sha256(sig); // Simplified - actual implementation needs proper transaction digest
	const result = schnorr.verify(sig, hash, pubkey);
	stack.push(result ? new Uint8Array([1]) : new Uint8Array([]));
};

export const OP_CHECKSIGADD = 0xba; // new opcode
// Implement new CHECKSIGADD operation
BIP_341_TAPROOT_OPCODE_TABLE[OP_CHECKSIGADD] = ({ stack }) => {
	if (stack.length < 3) {
		throw new Error("OP_CHECKSIGADD: Stack underflow");
	}
	const pubkey = stack.pop()!;
	const sig = stack.pop()!;
	const num = stack.pop()![0]!;

	const hash = sha256(sig); // Simplified - actual implementation needs proper transaction digest
	const result = schnorr.verify(sig, hash, pubkey);
	stack.push(new Uint8Array([num + (result ? 1 : 0)]));
};

// Disable operations not allowed in Taproot
export const OP_CHECKMULTISIG = 0xae;
BIP_341_TAPROOT_OPCODE_TABLE[OP_CHECKMULTISIG] = () => {};

export const OP_CHECKMULTISIGVERIFY = 0xaf;
BIP_341_TAPROOT_OPCODE_TABLE[OP_CHECKMULTISIGVERIFY] = () => {};

export const OP_CODESEPARATOR = 0xab;
BIP_341_TAPROOT_OPCODE_TABLE[OP_CODESEPARATOR] = () => {};
