import { IsUnion } from "../utils/types.ts";

export const BIP_65_ACTIVATION_HEIGHT = 388381; // Mainnet activation height for BIP 65

type ThisModule = typeof import("./BIP_65.ts");
type OP_CODES = Pick<ThisModule, keyof ThisModule & `OP_${string}`>;
type OP_CODES_REVERSE = { [K in keyof OP_CODES as OP_CODES[K]]: K };

// Ensure that OP_CODES has unique values
type OP_CODES_DUPLICATES = {
	[K in keyof OP_CODES_REVERSE]: IsUnion<OP_CODES_REVERSE[K]> extends true ? OP_CODES_REVERSE[K] : never;
}[OP_CODES[keyof OP_CODES]];
({} as OP_CODES_DUPLICATES) satisfies never;

export const OP_CHECKLOCKTIMEVERIFY = 0xb1; // formerly OP_NOP2
