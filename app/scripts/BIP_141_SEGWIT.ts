import { IsUnion } from "../utils/types.ts";

export const BIP_141_SEGWIT_ACTIVATION_HEIGHT = 481824; // Mainnet activation height for BIP 141 (SegWit)

type ThisModule = typeof import("./BIP_141_SEGWIT.ts");
type OP_CODES = Pick<ThisModule, keyof ThisModule & `OP_${string}`>;
type OP_CODES_REVERSE = { [K in keyof OP_CODES as OP_CODES[K]]: K };

// Ensure that OP_CODES has unique values
type OP_CODES_DUPLICATES = {
	[K in keyof OP_CODES_REVERSE]: IsUnion<OP_CODES_REVERSE[K]> extends true ? OP_CODES_REVERSE[K] : never;
}[OP_CODES[keyof OP_CODES]];
({} as OP_CODES_DUPLICATES) satisfies never;

export const OP_CHECKSIG = 0xac; // now uses BIP143 signature hashing
export const OP_CHECKSIGVERIFY = 0xad; // same, with VERIFY
export const OP_CHECKMULTISIG = 0xae; // BIP143 sighash, stack changes
export const OP_CHECKMULTISIGVERIFY = 0xaf; // same
export const OP_CODESEPARATOR = 0xab; // becomes NO-OP (ignored) in SegWit v0
