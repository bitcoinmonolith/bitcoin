import { sha256 } from "@noble/hashes/sha2";
import { ripemd160 } from "@noble/hashes/legacy";
import { sha1 } from "@noble/hashes/sha1";
import { verify } from "@noble/secp256k1";
import { bytesConcat, bytesEqual } from "../utils/bytes.ts";
import { IsUnion } from "../utils/types.ts";
import { Tx } from "../types/Tx.ts";
import { encodeVarInt } from "../utils/encoding.ts";

const SIGHASH_ALL = 0x01;
const SIGHASH_NONE = 0x02;
const SIGHASH_SINGLE = 0x03;
const SIGHASH_ANYONECANPAY = 0x80;

type ThisModule = typeof import("./GENESIS.ts");
type OP_CODES = Pick<ThisModule, keyof ThisModule & `OP_${string}`>;

// Ensure that OP_CODES has unique values
({} as OPCODE_DUPLICATES<OP_CODES>) satisfies never;

export type OPCODE_DUPLICATES<
	T extends Record<`OP_${string}`, number>,
	TReverse extends Record<number, `OP_${string}`> = { [K in keyof T as T[K] extends number ? T[K] : never]: K },
> = {
	[K in keyof TReverse]: IsUnion<TReverse[K]> extends true ? TReverse[K]
		: never;
}[keyof TReverse];

export type OPCODE_CONTEXT = {
	pc: number;
	stack: Uint8Array[];
	altStack: Uint8Array[];
	execStack: boolean[];
	script: Uint8Array;
	execute: (script: Uint8Array) => Promise<boolean>;
	tx: Tx;
	inputIndex: number;
};
export type OPCODE_TABLE = {
	(ctx: OPCODE_CONTEXT): Promise<boolean> | boolean;
}[];

export const OPCODE_TABLE_GENESIS: OPCODE_TABLE = new Array(256).fill(() => false);

// constants
export const OP_0 = 0x00;
OPCODE_TABLE_GENESIS[OP_0] = ({ stack }) => {
	stack.push(new Uint8Array([])); // Empty array represents 0
	return true;
};
export const OP_PUSHDATA1 = 0x4c;
OPCODE_TABLE_GENESIS[OP_PUSHDATA1] = (ctx) => {
	if (ctx.pc + 1 >= ctx.script.length) throw new Error("OP_PUSHDATA1: Script out of bounds");
	const len = ctx.script[ctx.pc + 1]!;
	if (ctx.pc + 1 + len >= ctx.script.length) throw new Error("OP_PUSHDATA1: Script out of bounds");
	ctx.stack.push(ctx.script.slice(ctx.pc + 2, ctx.pc + 2 + len));
	ctx.pc = ctx.pc + 2 + len - 1; // -1 because interpreter will increment pc
	return true;
};

export const OP_PUSHDATA2 = 0x4d;
OPCODE_TABLE_GENESIS[OP_PUSHDATA2] = (ctx) => {
	if (ctx.pc + 2 >= ctx.script.length) throw new Error("OP_PUSHDATA2: Script out of bounds");
	const len = ctx.script[ctx.pc + 1]! | (ctx.script[ctx.pc + 2]! << 8);
	if (ctx.pc + 2 + len >= ctx.script.length) throw new Error("OP_PUSHDATA2: Script out of bounds");
	ctx.stack.push(ctx.script.slice(ctx.pc + 3, ctx.pc + 3 + len));
	ctx.pc = ctx.pc + 3 + len - 1; // -1 because interpreter will increment pc
	return true;
};

export const OP_PUSHDATA4 = 0x4e;
OPCODE_TABLE_GENESIS[OP_PUSHDATA4] = (ctx) => {
	if (ctx.pc + 4 >= ctx.script.length) throw new Error("OP_PUSHDATA4: Script out of bounds");
	const len = ctx.script[ctx.pc + 1]! | (ctx.script[ctx.pc + 2]! << 8) |
		(ctx.script[ctx.pc + 3]! << 16) | (ctx.script[ctx.pc + 4]! << 24);
	if (ctx.pc + 4 + len >= ctx.script.length) throw new Error("OP_PUSHDATA4: Script out of bounds");
	ctx.stack.push(ctx.script.slice(ctx.pc + 5, ctx.pc + 5 + len));
	ctx.pc = ctx.pc + 5 + len - 1; // -1 because interpreter will increment pc
	return true;
};

export const OP_1NEGATE = 0x4f;
OPCODE_TABLE_GENESIS[OP_1NEGATE] = ({ stack }) => {
	stack.push(new Uint8Array([0x81])); // -1 in minimal encoding
	return true;
};

export const OP_RESERVED = 0x50;
OPCODE_TABLE_GENESIS[OP_RESERVED] = () => {
	throw new Error("OP_RESERVED: Disabled operation");
};

export const OP_1 = 0x51;
OPCODE_TABLE_GENESIS[OP_1] = ({ stack }) => {
	stack.push(new Uint8Array([0x01]));
	return true;
};
export const OP_2 = 0x52;
OPCODE_TABLE_GENESIS[OP_2] = ({ stack }) => {
	stack.push(new Uint8Array([0x02]));
	return true;
};
// OP_3 through OP_16 follow same pattern
export const OP_3 = 0x53;
OPCODE_TABLE_GENESIS[OP_3] = ({ stack }) => {
	stack.push(new Uint8Array([0x03]));
	return true;
};

export const OP_4 = 0x54;
OPCODE_TABLE_GENESIS[OP_4] = ({ stack }) => {
	stack.push(new Uint8Array([0x04]));
	return true;
};

export const OP_5 = 0x55;
OPCODE_TABLE_GENESIS[OP_5] = ({ stack }) => {
	stack.push(new Uint8Array([0x05]));
	return true;
};

export const OP_6 = 0x56;
OPCODE_TABLE_GENESIS[OP_6] = ({ stack }) => {
	stack.push(new Uint8Array([0x06]));
	return true;
};

export const OP_7 = 0x57;
OPCODE_TABLE_GENESIS[OP_7] = ({ stack }) => {
	stack.push(new Uint8Array([0x07]));
	return true;
};

export const OP_8 = 0x58;
OPCODE_TABLE_GENESIS[OP_8] = ({ stack }) => {
	stack.push(new Uint8Array([0x08]));
	return true;
};

export const OP_9 = 0x59;
OPCODE_TABLE_GENESIS[OP_9] = ({ stack }) => {
	stack.push(new Uint8Array([0x09]));
	return true;
};

export const OP_10 = 0x5a;
OPCODE_TABLE_GENESIS[OP_10] = ({ stack }) => {
	stack.push(new Uint8Array([0x0a]));
	return true;
};

export const OP_11 = 0x5b;
OPCODE_TABLE_GENESIS[OP_11] = ({ stack }) => {
	stack.push(new Uint8Array([0x0b]));
	return true;
};

export const OP_12 = 0x5c;
OPCODE_TABLE_GENESIS[OP_12] = ({ stack }) => {
	stack.push(new Uint8Array([0x0c]));
	return true;
};

export const OP_13 = 0x5d;
OPCODE_TABLE_GENESIS[OP_13] = ({ stack }) => {
	stack.push(new Uint8Array([0x0d]));
	return true;
};

export const OP_14 = 0x5e;
OPCODE_TABLE_GENESIS[OP_14] = ({ stack }) => {
	stack.push(new Uint8Array([0x0e]));
	return true;
};

export const OP_15 = 0x5f;
OPCODE_TABLE_GENESIS[OP_15] = ({ stack }) => {
	stack.push(new Uint8Array([0x0f]));
	return true;
};

export const OP_16 = 0x60;
OPCODE_TABLE_GENESIS[OP_16] = ({ stack }) => {
	stack.push(new Uint8Array([0x10]));
	return true;
};

export const OP_NOP = 0x61;
OPCODE_TABLE_GENESIS[OP_NOP] = () => true;

export const OP_IF = 0x63;
OPCODE_TABLE_GENESIS[OP_IF] = ({ stack, execStack }) => {
	// Check if we are currently in a false execution context
	const shouldExecute = execStack.length === 0 || execStack[execStack.length - 1];

	if (shouldExecute) {
		if (stack.length === 0) {
			throw new Error("OP_IF: Empty stack");
		}

		const value = stack.pop()!;

		// Interpret value as truthy if not 0 (empty buffer or 0 is false)
		const isTruthy = value.length > 0 && !value.every((byte) => byte === 0);

		execStack.push(isTruthy);
	} else {
		// Still need to push false to execStack to maintain block nesting
		execStack.push(false);
	}

	return true;
};

export const OP_NOTIF = 0x64;
OPCODE_TABLE_GENESIS[OP_NOTIF] = ({ stack, execStack }) => {
	const top = stack.pop();
	if (!top) {
		throw new Error("OP_NOTIF: Empty stack");
	}
	// In Genesis, any non-zero value or non-empty array was considered true
	execStack.push(top.length === 0 || top[0] === 0);
	return true;
};

export const OP_ELSE = 0x67;
OPCODE_TABLE_GENESIS[OP_ELSE] = ({ execStack }) => {
	if (execStack.length < 1) throw new Error("OP_ELSE: Execution stack underflow");
	execStack[execStack.length - 1] = !execStack[execStack.length - 1];
	return true;
};

export const OP_ENDIF = 0x68;
OPCODE_TABLE_GENESIS[OP_ENDIF] = ({ execStack }) => {
	if (execStack.length < 1) throw new Error("OP_ENDIF: Execution stack underflow");
	execStack.pop();
	return true;
};

export const OP_VERIFY = 0x69;
OPCODE_TABLE_GENESIS[OP_VERIFY] = ({ stack }) => {
	const top = stack.pop();
	if (!top) throw new Error("OP_VERIFY: Empty stack");
	return !bytesEqual(top, new Uint8Array([]));
};

export const OP_RETURN = 0x6a;
OPCODE_TABLE_GENESIS[OP_RETURN] = () => {
	throw new Error("OP_RETURN: Script terminated");
};

export const OP_TOALTSTACK = 0x6b;
OPCODE_TABLE_GENESIS[OP_TOALTSTACK] = ({ stack, altStack }) => {
	const top = stack.pop();
	if (!top) throw new Error("OP_TOALTSTACK: Empty stack");
	altStack.push(top);
	return true;
};

export const OP_FROMALTSTACK = 0x6c;
OPCODE_TABLE_GENESIS[OP_FROMALTSTACK] = ({ stack, altStack }) => {
	const top = altStack.pop();
	if (!top) throw new Error("OP_FROMALTSTACK: Empty altstack");
	stack.push(top);
	return true;
};

export const OP_2DROP = 0x6d;
OPCODE_TABLE_GENESIS[OP_2DROP] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_2DROP: Stack underflow");
	stack.pop();
	stack.pop();
	return true;
};

export const OP_2DUP = 0x6e;
OPCODE_TABLE_GENESIS[OP_2DUP] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_2DUP: Stack underflow");
	const v1 = stack[stack.length - 2]!;
	const v2 = stack[stack.length - 1]!;
	stack.push(v1);
	stack.push(v2);
	return true;
};

export const OP_3DUP = 0x6f;
OPCODE_TABLE_GENESIS[OP_3DUP] = ({ stack }) => {
	if (stack.length < 3) throw new Error("OP_3DUP: Stack underflow");
	const v1 = stack[stack.length - 3]!;
	const v2 = stack[stack.length - 2]!;
	const v3 = stack[stack.length - 1]!;
	stack.push(v1);
	stack.push(v2);
	stack.push(v3);
	return true;
};

export const OP_2OVER = 0x70;
OPCODE_TABLE_GENESIS[OP_2OVER] = ({ stack }) => {
	if (stack.length < 4) throw new Error("OP_2OVER: Stack underflow");
	const v1 = stack[stack.length - 4]!;
	const v2 = stack[stack.length - 3]!;
	stack.push(v1);
	stack.push(v2);
	return true;
};

export const OP_2ROT = 0x71;
OPCODE_TABLE_GENESIS[OP_2ROT] = ({ stack }) => {
	if (stack.length < 6) throw new Error("OP_2ROT: Stack underflow");
	const v1 = stack.splice(stack.length - 6, 1)[0]!;
	const v2 = stack.splice(stack.length - 5, 1)[0]!;
	const v3 = stack.splice(stack.length - 4, 1)[0]!;
	const v4 = stack.splice(stack.length - 3, 1)[0]!;
	const v5 = stack.splice(stack.length - 2, 1)[0]!;
	const v6 = stack.splice(stack.length - 1, 1)[0]!;
	stack.push(v3);
	stack.push(v4);
	stack.push(v5);
	stack.push(v6);
	stack.push(v1);
	stack.push(v2);
	return true;
};

export const OP_2SWAP = 0x72;
OPCODE_TABLE_GENESIS[OP_2SWAP] = ({ stack }) => {
	if (stack.length < 4) throw new Error("OP_2SWAP: Stack underflow");
	const v1 = stack.splice(stack.length - 4, 1)[0]!;
	const v2 = stack.splice(stack.length - 3, 1)[0]!;
	const v3 = stack.splice(stack.length - 2, 1)[0]!;
	const v4 = stack.splice(stack.length - 1, 1)[0]!;
	stack.push(v3);
	stack.push(v4);
	stack.push(v1);
	stack.push(v2);
	return true;
};

export const OP_IFDUP = 0x73;
OPCODE_TABLE_GENESIS[OP_IFDUP] = ({ stack }) => {
	if (stack.length < 1) throw new Error("OP_IFDUP: Empty stack");
	const v = stack[stack.length - 1]!;
	if (!bytesEqual(v, new Uint8Array([]))) {
		stack.push(v);
	}
	return true;
};

export const OP_DEPTH = 0x74;
OPCODE_TABLE_GENESIS[OP_DEPTH] = ({ stack }) => {
	stack.push(new Uint8Array([stack.length]));
	return true;
};

export const OP_DROP = 0x75;
OPCODE_TABLE_GENESIS[OP_DROP] = ({ stack }) => {
	if (stack.length < 1) throw new Error("OP_DROP: Empty stack");
	stack.pop();
	return true;
};

export const OP_DUP = 0x76;
OPCODE_TABLE_GENESIS[OP_DUP] = ({ stack }) => {
	if (stack.length < 1) throw new Error("OP_DUP: Empty stack");
	const top = stack[stack.length - 1]!;
	stack.push(top);
	return true;
};

export const OP_NIP = 0x77;
OPCODE_TABLE_GENESIS[OP_NIP] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_NIP: Stack underflow");
	const top = stack.pop()!;
	stack.pop();
	stack.push(top);
	return true;
};

export const OP_OVER = 0x78;
OPCODE_TABLE_GENESIS[OP_OVER] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_OVER: Stack underflow");
	stack.push(stack[stack.length - 2]!);
	return true;
};

export const OP_PICK = 0x79;
OPCODE_TABLE_GENESIS[OP_PICK] = ({ stack }) => {
	if (stack.length < 1) throw new Error("OP_PICK: Empty stack");
	const n = stack.pop()![0]!;
	if (stack.length < n + 1) throw new Error("OP_PICK: Stack underflow");
	stack.push(stack[stack.length - n - 1]!);
	return true;
};

export const OP_ROLL = 0x7a;
OPCODE_TABLE_GENESIS[OP_ROLL] = ({ stack }) => {
	if (stack.length < 1) throw new Error("OP_ROLL: Empty stack");
	const n = stack.pop()![0]!;
	if (stack.length < n + 1) throw new Error("OP_ROLL: Stack underflow");
	const v = stack.splice(stack.length - 1 - n, 1)[0]!;
	stack.push(v);
	return true;
};

export const OP_ROT = 0x7b;
OPCODE_TABLE_GENESIS[OP_ROT] = ({ stack }) => {
	if (stack.length < 3) throw new Error("OP_ROT: Stack underflow");
	const v = stack.splice(stack.length - 3, 1)[0]!;
	stack.push(v);
	return true;
};

export const OP_SWAP = 0x7c;
OPCODE_TABLE_GENESIS[OP_SWAP] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_SWAP: Stack underflow");
	const v1 = stack.pop()!;
	const v2 = stack.pop()!;
	stack.push(v1);
	stack.push(v2);
	return true;
};

export const OP_TUCK = 0x7d;
OPCODE_TABLE_GENESIS[OP_TUCK] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_TUCK: Stack underflow");
	const v1 = stack.pop()!;
	const v2 = stack.pop()!;
	stack.push(v1);
	stack.push(v2);
	stack.push(v1);
	return true;
};

// splice
// export const OP_CAT = 0x7e;       // broken / disabled from block 0
// export const OP_SUBSTR = 0x7f;    // broken
// export const OP_LEFT = 0x80;      // broken
// export const OP_RIGHT = 0x81;     // broken
export const OP_SIZE = 0x82;
OPCODE_TABLE_GENESIS[OP_SIZE] = ({ stack }) => {
	if (stack.length < 1) throw new Error("OP_SIZE: Empty stack");
	const top = stack[stack.length - 1]!;
	stack.push(new Uint8Array([top.length]));
	return true;
};

// bit logic
// export const OP_INVERT = 0x83;    // broken
// export const OP_AND = 0x84;       // broken
// export const OP_OR = 0x85;        // broken
// export const OP_XOR = 0x86;       // broken
export const OP_EQUAL = 0x87;
OPCODE_TABLE_GENESIS[OP_EQUAL] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_EQUAL: Stack underflow");
	const v1 = stack.pop()!;
	const v2 = stack.pop()!;
	if (v1.length !== v2.length) {
		stack.push(new Uint8Array([])); // Push false if lengths differ
		return true;
	}
	const result = v1.every((byte, index) => byte === v2[index]);
	stack.push(result ? new Uint8Array([1]) : new Uint8Array([]));
	return true;
};

export const OP_EQUALVERIFY = 0x88;
OPCODE_TABLE_GENESIS[OP_EQUALVERIFY] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_EQUALVERIFY: Stack underflow");
	const v1 = stack.pop()!;
	const v2 = stack.pop()!;
	return bytesEqual(v1, v2);
};

// arithmetic
export const OP_1ADD = 0x8b;
OPCODE_TABLE_GENESIS[OP_1ADD] = ({ stack }) => {
	if (stack.length < 1) throw new Error("OP_1ADD: Empty stack");
	const num = stack.pop()![0]!;
	stack.push(new Uint8Array([num + 1]));
	return true;
};

export const OP_1SUB = 0x8c;
OPCODE_TABLE_GENESIS[OP_1SUB] = ({ stack }) => {
	if (stack.length < 1) throw new Error("OP_1SUB: Empty stack");
	const num = stack.pop()![0]!;
	stack.push(new Uint8Array([num - 1]));
	return true;
};

// export const OP_2MUL = 0x8d;      // broken
// export const OP_2DIV = 0x8e;      // broken
export const OP_NEGATE = 0x8f;
OPCODE_TABLE_GENESIS[OP_NEGATE] = ({ stack }) => {
	if (stack.length < 1) throw new Error("OP_NEGATE: Empty stack");
	const num = stack.pop()![0]!;
	stack.push(new Uint8Array([-num]));
	return true;
};

export const OP_ABS = 0x90;
OPCODE_TABLE_GENESIS[OP_ABS] = ({ stack }) => {
	if (stack.length < 1) throw new Error("OP_ABS: Empty stack");
	const num = stack.pop()![0]!;
	stack.push(new Uint8Array([Math.abs(num)]));
	return true;
};

export const OP_NOT = 0x91;
OPCODE_TABLE_GENESIS[OP_NOT] = ({ stack }) => {
	if (stack.length < 1) throw new Error("OP_NOT: Empty stack");
	const num = stack.pop()![0];
	stack.push(new Uint8Array([num === 0 ? 1 : 0]));
	return true;
};

export const OP_0NOTEQUAL = 0x92;
OPCODE_TABLE_GENESIS[OP_0NOTEQUAL] = ({ stack }) => {
	if (stack.length < 1) throw new Error("OP_0NOTEQUAL: Empty stack");
	const num = stack.pop()![0];
	stack.push(new Uint8Array([num !== 0 ? 1 : 0]));
	return true;
};

export const OP_ADD = 0x93;
OPCODE_TABLE_GENESIS[OP_ADD] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_ADD: Stack underflow");
	const b = stack.pop()!;
	const a = stack.pop()!;
	// Convert to numbers, add them, and push result as a single byte
	const result = (a.length > 0 ? a[0]! : 0) + (b.length > 0 ? b[0]! : 0);
	console.log("ADD", a, b, result);
	stack.push(new Uint8Array([result]));
	return true;
};

export const OP_SUB = 0x94;
OPCODE_TABLE_GENESIS[OP_SUB] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_SUB: Stack underflow");
	const b = stack.pop()![0]!;
	const a = stack.pop()![0]!;
	stack.push(new Uint8Array([a - b]));
	return true;
};

// export const OP_MUL = 0x95;       // broken
// export const OP_DIV = 0x96;       // broken
// export const OP_MOD = 0x97;       // broken
// export const OP_LSHIFT = 0x98;    // broken
// export const OP_RSHIFT = 0x99;    // broken
export const OP_BOOLAND = 0x9a;
OPCODE_TABLE_GENESIS[OP_BOOLAND] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_BOOLAND: Stack underflow");
	const b = stack.pop()![0];
	const a = stack.pop()![0];
	stack.push(new Uint8Array([a !== 0 && b !== 0 ? 1 : 0]));
	return true;
};

export const OP_BOOLOR = 0x9b;
OPCODE_TABLE_GENESIS[OP_BOOLOR] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_BOOLOR: Stack underflow");
	const b = stack.pop()![0];
	const a = stack.pop()![0];
	stack.push(new Uint8Array([a !== 0 || b !== 0 ? 1 : 0]));
	return true;
};

export const OP_NUMEQUAL = 0x9c;
OPCODE_TABLE_GENESIS[OP_NUMEQUAL] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_NUMEQUAL: Stack underflow");
	const b = stack.pop()![0];
	const a = stack.pop()![0];
	stack.push(new Uint8Array([a === b ? 1 : 0]));
	return true;
};

export const OP_NUMEQUALVERIFY = 0x9d;
OPCODE_TABLE_GENESIS[OP_NUMEQUALVERIFY] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_NUMEQUALVERIFY: Stack underflow");
	const b = stack.pop()![0];
	const a = stack.pop()![0];
	return a === b;
};

export const OP_NUMNOTEQUAL = 0x9e;
OPCODE_TABLE_GENESIS[OP_NUMNOTEQUAL] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_NUMNOTEQUAL: Stack underflow");
	const b = stack.pop()![0];
	const a = stack.pop()![0];
	stack.push(new Uint8Array([a !== b ? 1 : 0]));
	return true;
};

export const OP_LESSTHAN = 0x9f;
OPCODE_TABLE_GENESIS[OP_LESSTHAN] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_LESSTHAN: Stack underflow");
	const b = stack.pop()![0]!;
	const a = stack.pop()![0]!;
	stack.push(new Uint8Array([a < b ? 1 : 0]));
	return true;
};

export const OP_GREATERTHAN = 0xa0;
OPCODE_TABLE_GENESIS[OP_GREATERTHAN] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_GREATERTHAN: Stack underflow");
	const b = stack.pop()![0]!;
	const a = stack.pop()![0]!;
	stack.push(new Uint8Array([a > b ? 1 : 0]));
	return true;
};

export const OP_LESSTHANOREQUAL = 0xa1;
OPCODE_TABLE_GENESIS[OP_LESSTHANOREQUAL] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_LESSTHANOREQUAL: Stack underflow");
	const b = stack.pop()![0]!;
	const a = stack.pop()![0]!;
	stack.push(new Uint8Array([a <= b ? 1 : 0]));
	return true;
};

export const OP_GREATERTHANOREQUAL = 0xa2;
OPCODE_TABLE_GENESIS[OP_GREATERTHANOREQUAL] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_GREATERTHANOREQUAL: Stack underflow");
	const b = stack.pop()![0]!;
	const a = stack.pop()![0]!;
	stack.push(new Uint8Array([a >= b ? 1 : 0]));
	return true;
};

export const OP_MIN = 0xa3;
OPCODE_TABLE_GENESIS[OP_MIN] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_MIN: Stack underflow");
	const b = stack.pop()![0]!;
	const a = stack.pop()![0]!;
	stack.push(new Uint8Array([Math.min(a, b)]));
	return true;
};

export const OP_MAX = 0xa4;
OPCODE_TABLE_GENESIS[OP_MAX] = ({ stack }) => {
	if (stack.length < 2) throw new Error("OP_MAX: Stack underflow");
	const b = stack.pop()![0]!;
	const a = stack.pop()![0]!;
	stack.push(new Uint8Array([Math.max(a, b)]));
	return true;
};

export const OP_WITHIN = 0xa5;
OPCODE_TABLE_GENESIS[OP_WITHIN] = ({ stack }) => {
	if (stack.length < 3) throw new Error("OP_WITHIN: Stack underflow");
	const max = stack.pop()![0]!;
	const min = stack.pop()![0]!;
	const x = stack.pop()![0]!;
	stack.push(new Uint8Array([x >= min && x < max ? 1 : 0]));
	return true;
};

// crypto
export const OP_RIPEMD160 = 0xa6;
OPCODE_TABLE_GENESIS[OP_RIPEMD160] = ({ stack }) => {
	const top = stack.pop();
	if (!top) throw new Error("OP_RIPEMD160: Empty stack");
	stack.push(ripemd160(top));
	return true;
};

export const OP_SHA1 = 0xa7;
OPCODE_TABLE_GENESIS[OP_SHA1] = ({ stack }) => {
	const top = stack.pop();
	if (!top) throw new Error("OP_SHA1: Empty stack");
	stack.push(sha1(top));
	return true;
};

export const OP_SHA256 = 0xa8;
OPCODE_TABLE_GENESIS[OP_SHA256] = ({ stack }) => {
	const top = stack.pop();
	if (!top) throw new Error("OP_SHA256: Empty stack");
	stack.push(sha256(top));
	return true;
};

export const OP_HASH160 = 0xa9;
OPCODE_TABLE_GENESIS[OP_HASH160] = ({ stack }) => {
	const top = stack.pop();
	if (!top) throw new Error("OP_HASH160: Empty stack");
	const sha = sha256(top);
	const hash = ripemd160(sha);
	stack.push(hash);
	return true;
};

export const OP_HASH256 = 0xaa;
OPCODE_TABLE_GENESIS[OP_HASH256] = ({ stack }) => {
	const top = stack.pop();
	if (!top) throw new Error("OP_HASH256: Empty stack");
	const hash = sha256(sha256(top));
	stack.push(hash);
	return true;
};

// Helper function for legacy transaction signing
function sigHashTxDigest(
	tx: Tx,
	inputIndex: number,
	scriptCode: Uint8Array,
	sighashType: number,
): Uint8Array {
	// Special case: If SIGHASH_SINGLE and index out of bounds,
	// return "1" repeated 32 times as per Bitcoin Core
	if ((sighashType & 0x1f) === SIGHASH_SINGLE && inputIndex >= tx.outputs.length) {
		return new Uint8Array(32).fill(1);
	}

	// Copy transaction for modification
	const txCopy: Tx = {
		version: tx.version,
		inputs: tx.inputs.map((input, i) => ({
			...input,
			scriptSig: i === inputIndex ? scriptCode : new Uint8Array(),
		})),
		outputs: [...tx.outputs],
		locktime: tx.locktime,
	};

	// Handle different SIGHASH types
	if (sighashType & SIGHASH_ANYONECANPAY) {
		txCopy.inputs = [txCopy.inputs[inputIndex]!];
	}

	if ((sighashType & 0x1f) === SIGHASH_NONE) {
		txCopy.outputs = [];
		// Mark all other inputs' sequences as 0
		for (let i = 0; i < txCopy.inputs.length; i++) {
			if (i !== inputIndex) {
				txCopy.inputs[i]!.sequence = 0;
			}
		}
	} else if ((sighashType & 0x1f) === SIGHASH_SINGLE) {
		if (inputIndex >= tx.outputs.length) {
			// Return 1 as per Bitcoin Core when index out of bounds
			return new Uint8Array(32).fill(1);
		}
		// Keep only the output at the same index
		txCopy.outputs = txCopy.outputs.slice(0, inputIndex + 1);
		for (let i = 0; i < inputIndex; i++) {
			txCopy.outputs[i] = {
				value: 0xffffffffffffffffn,
				scriptPubKey: new Uint8Array(),
			};
		}
		// Mark all other inputs' sequences as 0
		for (let i = 0; i < txCopy.inputs.length; i++) {
			if (i !== inputIndex) {
				txCopy.inputs[i]!.sequence = 0;
			}
		}
	}

	// Legacy signing serialization and double SHA256
	return sha256(sha256(bytesConcat(
		// Version
		new Uint8Array(new Int32Array([txCopy.version]).buffer),
		// Input count
		encodeVarInt(txCopy.inputs.length),
		// Inputs
		...txCopy.inputs.map((input) =>
			bytesConcat(
				input.txid,
				new Uint8Array(new Uint32Array([input.vout]).buffer),
				encodeVarInt(input.scriptSig.length),
				input.scriptSig,
				new Uint8Array(new Uint32Array([input.sequence]).buffer),
			)
		),
		// Output count
		encodeVarInt(txCopy.outputs.length),
		// Outputs
		...txCopy.outputs.map((output) =>
			bytesConcat(
				new Uint8Array(new BigUint64Array([output.value]).buffer),
				encodeVarInt(output.scriptPubKey.length),
				output.scriptPubKey,
			)
		),
		// Locktime
		new Uint8Array(new Uint32Array([txCopy.locktime]).buffer),
		// Sighash type
		new Uint8Array([sighashType]),
	)));
}

export const OP_CODESEPARATOR = 0xab;
OPCODE_TABLE_GENESIS[OP_CODESEPARATOR] = () => true; // In Genesis, this was just a marker

export const OP_CHECKSIG = 0xac;
OPCODE_TABLE_GENESIS[OP_CHECKSIG] = ({ stack, tx, inputIndex, script }) => {
	if (stack.length < 2) throw new Error("OP_CHECKSIG: Stack underflow");
	const pubkey = stack.pop()!;
	const sig = stack.pop()!;

	try {
		// Get sighash type from last byte
		const sighashType = sig[sig.length - 1]!;
		const signature = sig.slice(0, -1);

		const sigHash = sigHashTxDigest(tx, inputIndex, script, sighashType);
		const result = verify(signature, sigHash, pubkey);
		stack.push(result ? new Uint8Array([1]) : new Uint8Array([]));
		return true;
	} catch {
		stack.push(new Uint8Array([]));
		return true;
	}
};

export const OP_CHECKSIGVERIFY = 0xad;
OPCODE_TABLE_GENESIS[OP_CHECKSIGVERIFY] = (ctx) => {
	if (!OPCODE_TABLE_GENESIS[OP_CHECKSIG]!(ctx)) throw new Error("OP_CHECKSIGVERIFY: Signature verification failed");
	return OPCODE_TABLE_GENESIS[OP_VERIFY]!(ctx);
};

export const OP_CHECKMULTISIG = 0xae;
OPCODE_TABLE_GENESIS[OP_CHECKMULTISIG] = ({ stack, tx, inputIndex, script }) => {
	if (stack.length < 1) throw new Error("OP_CHECKMULTISIG: Empty stack");
	const n = stack.pop()!;
	if (n[0]! < 0 || n[0]! > stack.length) throw new Error("OP_CHECKMULTISIG: Invalid n value");

	const pubkeys = [];
	for (let i = 0; i < n[0]!; i++) {
		const pubkey = stack.pop();
		if (!pubkey) throw new Error("OP_CHECKMULTISIG: Missing pubkey");
		pubkeys.push(pubkey);
	}

	if (stack.length < 1) throw new Error("OP_CHECKMULTISIG: Stack underflow");
	const m = stack.pop()!;
	if (m[0]! < 0 || m[0]! > stack.length) throw new Error("OP_CHECKMULTISIG: Invalid m value");

	const sigs = [];
	for (let i = 0; i < m[0]!; i++) {
		const sig = stack.pop();
		if (!sig) throw new Error("OP_CHECKMULTISIG: Missing signature");
		sigs.push(sig);
	}

	if (stack.length < 1) throw new Error("OP_CHECKMULTISIG: Missing dummy element");
	stack.pop();

	let sigIndex = 0;
	let success = true;

	for (const sig of sigs) {
		let found = false;
		while (sigIndex < pubkeys.length) {
			const pubkey = pubkeys[sigIndex]!;
			sigIndex++;
			try {
				// Get sighash type from last byte
				const sighashType = sig[sig.length - 1]!;
				const signature = sig.slice(0, -1);

				const sigHash = sigHashTxDigest(tx, inputIndex, script, sighashType);
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
	return true;
};

export const OP_CHECKMULTISIGVERIFY = 0xaf;
OPCODE_TABLE_GENESIS[OP_CHECKMULTISIGVERIFY] = (ctx) => {
	if (!OPCODE_TABLE_GENESIS[OP_CHECKMULTISIG]!(ctx)) {
		throw new Error("OP_CHECKMULTISIGVERIFY: Multisig verification failed");
	}
	return OPCODE_TABLE_GENESIS[OP_VERIFY]!(ctx);
};

// reserved / NOPs
export const OP_NOP1 = 0xb0;
OPCODE_TABLE_GENESIS[OP_NOP1] = () => true;

export const OP_NOP2 = 0xb1; // later becomes CLTV in BIP65
OPCODE_TABLE_GENESIS[OP_NOP2] = () => true;

export const OP_NOP3 = 0xb2; // later becomes CSV in BIP112
OPCODE_TABLE_GENESIS[OP_NOP3] = () => true;

export const OP_NOP4 = 0xb3;
OPCODE_TABLE_GENESIS[OP_NOP4] = () => true;

export const OP_NOP5 = 0xb4;
OPCODE_TABLE_GENESIS[OP_NOP5] = () => true;

export const OP_NOP6 = 0xb5;
OPCODE_TABLE_GENESIS[OP_NOP6] = () => true;

export const OP_NOP7 = 0xb6;
OPCODE_TABLE_GENESIS[OP_NOP7] = () => true;

export const OP_NOP8 = 0xb7;
OPCODE_TABLE_GENESIS[OP_NOP8] = () => true;

export const OP_NOP9 = 0xb8;
OPCODE_TABLE_GENESIS[OP_NOP9] = () => true;

export const OP_NOP10 = 0xb9;
OPCODE_TABLE_GENESIS[OP_NOP10] = () => true;
