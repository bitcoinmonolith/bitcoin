import { IsUnion } from "../utils/types.ts";

export const BIP_341_TAPROOT_ACTIVATION_HEIGHT = 709632; // Mainnet activation height for BIP 341 (Taproot)

type ThisModule = typeof import("./BIP_341_TAPROOT.ts");
type OP_CODES = Pick<ThisModule, keyof ThisModule & `OP_${string}`>;
type OP_CODES_REVERSE = { [K in keyof OP_CODES as OP_CODES[K]]: K };

// Ensure that OP_CODES has unique values
type OP_CODES_DUPLICATES = {
	[K in keyof OP_CODES_REVERSE]: IsUnion<OP_CODES_REVERSE[K]> extends true ? OP_CODES_REVERSE[K] : never;
}[OP_CODES[keyof OP_CODES]];
({} as OP_CODES_DUPLICATES) satisfies never;

export const OP_CHECKSIGADD = 0xba; // new opcode
export const OP_CHECKSIG = 0xac; // uses Schnorr in Tapscript

// the following are disallowed in Tapscript:
export const OP_CHECKMULTISIG = 0xae;
export const OP_CHECKMULTISIGVERIFY = 0xaf;
export const OP_CODESEPARATOR = 0xab;
