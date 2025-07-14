import { IsUnion } from "../utils/types.ts";

type ThisModule = typeof import("./GENESIS.ts");
type OP_CODES = Pick<ThisModule, keyof ThisModule & `OP_${string}`>;
type OP_CODES_REVERSE = { [K in keyof OP_CODES as OP_CODES[K]]: K };

// Ensure that OP_CODES has unique values
type OP_CODES_DUPLICATES = {
	[K in keyof OP_CODES_REVERSE]: IsUnion<OP_CODES_REVERSE[K]> extends true ? OP_CODES_REVERSE[K]
		: never;
}[OP_CODES[keyof OP_CODES]];
({} as OP_CODES_DUPLICATES) satisfies never;

export const OPCODE_TABLE_GENESIS: {
	(program: {
		pc: number;
		stack: Uint8Array[];
		altStack: Uint8Array[];
		execStack: boolean[];
	}): void;
}[] = new Array(256).fill(() => false);

// constants
export const OP_0 = 0x00;
OPCODE_TABLE_GENESIS[OP_0] = ({ stack }) => {
	stack.push(new Uint8Array([]));
	return true;
};
export const OP_PUSHDATA1 = 0x4c;
export const OP_PUSHDATA2 = 0x4d;
export const OP_PUSHDATA4 = 0x4e;
export const OP_1NEGATE = 0x4f;
export const OP_RESERVED = 0x50;
export const OP_1 = 0x51;
export const OP_2 = 0x52;
export const OP_3 = 0x53;
export const OP_4 = 0x54;
export const OP_5 = 0x55;
export const OP_6 = 0x56;
export const OP_7 = 0x57;
export const OP_8 = 0x58;
export const OP_9 = 0x59;
export const OP_10 = 0x5a;
export const OP_11 = 0x5b;
export const OP_12 = 0x5c;
export const OP_13 = 0x5d;
export const OP_14 = 0x5e;
export const OP_15 = 0x5f;
export const OP_16 = 0x60;

// flow control
export const OP_NOP = 0x61;
export const OP_IF = 0x63;
export const OP_NOTIF = 0x64;
export const OP_ELSE = 0x67;
export const OP_ENDIF = 0x68;
export const OP_VERIFY = 0x69;
export const OP_RETURN = 0x6a;

// stack
export const OP_TOALTSTACK = 0x6b;
export const OP_FROMALTSTACK = 0x6c;
export const OP_2DROP = 0x6d;
export const OP_2DUP = 0x6e;
export const OP_3DUP = 0x6f;
export const OP_2OVER = 0x70;
export const OP_2ROT = 0x71;
export const OP_2SWAP = 0x72;
export const OP_IFDUP = 0x73;
export const OP_DEPTH = 0x74;
export const OP_DROP = 0x75;
export const OP_DUP = 0x76;
export const OP_NIP = 0x77;
export const OP_OVER = 0x78;
export const OP_PICK = 0x79;
export const OP_ROLL = 0x7a;
export const OP_ROT = 0x7b;
export const OP_SWAP = 0x7c;
export const OP_TUCK = 0x7d;

// splice
// export const OP_CAT = 0x7e;       // broken / disabled from block 0
// export const OP_SUBSTR = 0x7f;    // broken
// export const OP_LEFT = 0x80;      // broken
// export const OP_RIGHT = 0x81;     // broken
export const OP_SIZE = 0x82;

// bit logic
// export const OP_INVERT = 0x83;    // broken
// export const OP_AND = 0x84;       // broken
// export const OP_OR = 0x85;        // broken
// export const OP_XOR = 0x86;       // broken
export const OP_EQUAL = 0x87;
export const OP_EQUALVERIFY = 0x88;

// arithmetic
export const OP_1ADD = 0x8b;
export const OP_1SUB = 0x8c;
// export const OP_2MUL = 0x8d;      // broken
// export const OP_2DIV = 0x8e;      // broken
export const OP_NEGATE = 0x8f;
export const OP_ABS = 0x90;
export const OP_NOT = 0x91;
export const OP_0NOTEQUAL = 0x92;
export const OP_ADD = 0x93;
export const OP_SUB = 0x94;
// export const OP_MUL = 0x95;       // broken
// export const OP_DIV = 0x96;       // broken
// export const OP_MOD = 0x97;       // broken
// export const OP_LSHIFT = 0x98;    // broken
// export const OP_RSHIFT = 0x99;    // broken
export const OP_BOOLAND = 0x9a;
export const OP_BOOLOR = 0x9b;
export const OP_NUMEQUAL = 0x9c;
export const OP_NUMEQUALVERIFY = 0x9d;
export const OP_NUMNOTEQUAL = 0x9e;
export const OP_LESSTHAN = 0x9f;
export const OP_GREATERTHAN = 0xa0;
export const OP_LESSTHANOREQUAL = 0xa1;
export const OP_GREATERTHANOREQUAL = 0xa2;
export const OP_MIN = 0xa3;
export const OP_MAX = 0xa4;
export const OP_WITHIN = 0xa5;

// crypto
export const OP_RIPEMD160 = 0xa6;
export const OP_SHA1 = 0xa7;
export const OP_SHA256 = 0xa8;
export const OP_HASH160 = 0xa9;
export const OP_HASH256 = 0xaa;
export const OP_CODESEPARATOR = 0xab;
export const OP_CHECKSIG = 0xac;
export const OP_CHECKSIGVERIFY = 0xad;
export const OP_CHECKMULTISIG = 0xae;
export const OP_CHECKMULTISIGVERIFY = 0xaf;

// reserved / NOPs
export const OP_NOP1 = 0xb0;
export const OP_NOP2 = 0xb1; // later becomes CLTV in BIP65
export const OP_NOP3 = 0xb2; // later becomes CSV in BIP112
export const OP_NOP4 = 0xb3;
export const OP_NOP5 = 0xb4;
export const OP_NOP6 = 0xb5;
export const OP_NOP7 = 0xb6;
export const OP_NOP8 = 0xb7;
export const OP_NOP9 = 0xb8;
export const OP_NOP10 = 0xb9;
