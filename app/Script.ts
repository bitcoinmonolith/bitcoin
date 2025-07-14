import { sha256 } from "@noble/hashes/sha2";
import { ripemd160 } from "@noble/hashes/legacy";
import { verify } from "@noble/secp256k1";
import { Tx } from "./types/Tx.ts";
import { bytesConcat, bytesEqual } from "./utils/bytes.ts";
import { IsUnion } from "./utils/types.ts";
import { decodeVarInt, decodeVarIntNumber, encodeVarInt } from "./utils/encoding.ts";

type ThisModule = typeof import("./Script.ts");
type OP_CODES = Pick<ThisModule, keyof ThisModule & `OP_${string}`>;
type OP_CODES_REVERSE = {
	[K in keyof OP_CODES as OP_CODES[K]]: K;
};

// Ensure that OP_CODES has unique values
type OP_CODES_DUPLICATES = {
	[K in keyof OP_CODES_REVERSE]: IsUnion<OP_CODES_REVERSE[K]> extends true ? OP_CODES_REVERSE[K] : never;
}[OP_CODES[keyof OP_CODES]];
({} as OP_CODES_DUPLICATES) satisfies never;

export const OP_0 = 0x00;
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

export const OP_NOP = 0x61;
export const OP_IF = 0x63;
export const OP_NOTIF = 0x64;
export const OP_ELSE = 0x67;
export const OP_ENDIF = 0x68;
export const OP_VERIFY = 0x69;
export const OP_RETURN = 0x6a;

export const OP_TOALTSTACK = 0x6b;
export const OP_FROMALTSTACK = 0x6c;
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

export const OP_SIZE = 0x82;
export const OP_EQUAL = 0x87;
export const OP_EQUALVERIFY = 0x88;

export const OP_1ADD = 0x8b;
export const OP_1SUB = 0x8c;
export const OP_NEGATE = 0x8f;
export const OP_ABS = 0x90;
export const OP_NOT = 0x91;
export const OP_0NOTEQUAL = 0x92;

export const OP_ADD = 0x93;
export const OP_SUB = 0x94;

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

export const OP_NOP1 = 0xb0;
export const OP_NOP2 = 0xb1;
export const OP_NOP3 = 0xb2;
export const OP_NOP4 = 0xb3;
export const OP_NOP5 = 0xb4;
export const OP_NOP6 = 0xb5;
export const OP_NOP7 = 0xb6;
export const OP_NOP8 = 0xb7;
export const OP_NOP9 = 0xb8;
export const OP_NOP10 = 0xb9;

function getSubscript(script: Uint8Array, sig: Uint8Array, lastCodeSep: number = 0): Uint8Array {
	// Start from last CODESEPARATOR position
	script = script.slice(lastCodeSep);

	// Remove all instances of sig from script
	const chunks: Uint8Array[] = [];
	let i = 0;
	while (i < script.length) {
		const opcode = script[i];
		if (opcode && opcode <= 0x4b) { // Push data operations
			const len = opcode;
			const data = script.slice(i + 1, i + 1 + len);
			// Only include if not the signature we're checking
			if (data.length !== sig.length || !data.every((b, j) => b === sig[j])) {
				chunks.push(script.slice(i, i + 1 + len));
			}
			i += 1 + len;
		} else if (opcode === OP_CODESEPARATOR) {
			// Skip CODESEPARATOR ops
			i++;
		} else {
			chunks.push(script.slice(i, i + 1));
			i++;
		}
	}
	return bytesConcat(...chunks);
}

function decodeIntLE(b: Uint8Array): number {
	if (b.length === 0) return 0;
	let result = 0;
	for (let i = 0; i < b.length; i++) {
		result |= b[i]! << (8 * i);
	}
	// Sign bit
	if (b.length > 0 && (b[b.length - 1]! & 0x80)) {
		result -= 1 << (8 * b.length);
	}
	return result;
}

function encodeIntLE(n: number): Uint8Array {
	if (n === 0) return new Uint8Array([]);
	const abs = Math.abs(n);
	const result: number[] = [];
	let i = 0;
	while (abs >> (8 * i)) {
		result.push((abs >> (8 * i)) & 0xff);
		i++;
	}
	// Add sign bit
	if (n < 0) {
		if (result.length === 0) {
			result.push(0x80);
		} else {
			result[result.length - 1]! |= 0x80;
		}
	}
	return new Uint8Array(result);
}

export async function executeScript(
	script: Uint8Array,
	ctx: { tx: Tx; inputIndex: number; subscript?: Uint8Array; lastCodeSep?: number },
): Promise<boolean> {
	let pc: number = 0;
	const stack: Uint8Array[] = [];
	const altStack: Uint8Array[] = [];
	const execStack: boolean[] = [];

	while (pc < script.length) {
		const opcode = script[pc++] as OP_CODES[keyof OP_CODES];

		// Skip execution if inside a false branch
		if (execStack.includes(false)) {
			// Still process flow control ops to maintain execStack
			if (![OP_IF, OP_NOTIF, OP_ELSE, OP_ENDIF].includes(opcode)) {
				continue;
			}
		}

		if (opcode >= 0x01 && opcode <= 0x4b) {
			const size = opcode;
			const data = script.slice(pc, pc + size);
			pc += size;
			stack.push(data);
			continue;
		}

		switch (opcode) {
			case OP_0:
				stack.push(new Uint8Array([]));
				break;

			case OP_PUSHDATA1: {
				const size = script[pc++]!;
				const data = script.slice(pc, pc + size);
				pc += size;
				stack.push(data);
				break;
			}

			case OP_PUSHDATA2: {
				const size = script[pc]! | (script[pc + 1]! << 8);
				pc += 2;
				const data = script.slice(pc, pc + size);
				pc += size;
				stack.push(data);
				break;
			}

			case OP_PUSHDATA4: {
				const size = script[pc]! |
					(script[pc + 1]! << 8) |
					(script[pc + 2]! << 16) |
					(script[pc + 3]! << 24);
				pc += 4;
				const data = script.slice(pc, pc + size);
				pc += size;
				stack.push(data);
				break;
			}

			case OP_DUP: {
				const top = stack[stack.length - 1];
				if (!top) return false;
				stack.push(top);
				break;
			}

			case OP_EQUAL: {
				const a = stack.pop();
				const b = stack.pop();
				if (!a || !b) return false;
				const isEqual = a.length === b.length && a.every((v, i) => v === b[i]);
				stack.push(new Uint8Array([isEqual ? 1 : 0]));
				break;
			}

			case OP_EQUALVERIFY: {
				const a = stack.pop();
				const b = stack.pop();
				if (!a || !b) return false;
				const isEqual = a.length === b.length && a.every((v, i) => v === b[i]);
				if (!isEqual) return false;
				break;
			}

			case OP_HASH160: {
				const top = stack.pop();
				if (!top) return false;
				stack.push(ripemd160(sha256(top)));
				break;
			}

			case OP_CHECKSIG: {
				const sigWithHashType = stack.pop();
				const pubkey = stack.pop();
				if (!pubkey || !sigWithHashType || sigWithHashType.length < 1) return false;

				const sighashType = sigWithHashType[sigWithHashType.length - 1]!;
				const sig = sigWithHashType.slice(0, -1); // strip sighash byte

				const subscript = ctx.subscript ??= getSubscript(script, sigWithHashType, ctx.lastCodeSep ?? 0);
				const messageHash = await computeSighash(ctx.tx, ctx.inputIndex, subscript, sighashType);
				if (!messageHash) return false;

				try {
					const valid = verify(sig, messageHash, pubkey);
					stack.push(new Uint8Array([valid ? 1 : 0]));
				} catch {
					stack.push(new Uint8Array([0]));
				}
				break;
			}

			case OP_CHECKSIGVERIFY: {
				if (!(await executeScript(Uint8Array.of(OP_CHECKSIG), ctx))) return false;
				const result = stack.pop();
				if (!result || !result.some((b) => b !== 0)) return false;
				break;
			}

			case OP_CHECKMULTISIGVERIFY: {
				if (!(await executeScript(Uint8Array.of(OP_CHECKMULTISIG), ctx))) return false;
				const result = stack.pop();
				if (!result || !result.some((b) => b !== 0)) return false;
				break;
			}

			case OP_DROP: {
				const val = stack.pop();
				if (!val) return false;
				break;
			}

			case OP_SWAP: {
				if (stack.length < 2) return false;
				const a = stack.pop()!;
				const b = stack.pop()!;
				stack.push(a, b);
				break;
			}

			case OP_OVER: {
				if (stack.length < 2) return false;
				const val = stack[stack.length - 2]!;
				stack.push(val);
				break;
			}

			case OP_NIP: {
				if (stack.length < 2) return false;
				const top = stack.pop()!;
				stack.pop(); // remove the second-to-top
				stack.push(top);
				break;
			}

			case OP_TUCK: {
				if (stack.length < 2) return false;
				const a = stack.pop()!;
				const b = stack.pop()!;
				stack.push(a, b, a);
				break;
			}

			case OP_DEPTH: {
				const depth = stack.length;
				stack.push(new Uint8Array([depth]));
				break;
			}

			case OP_ROT: {
				if (stack.length < 3) return false;
				const c = stack.pop()!;
				const b = stack.pop()!;
				const a = stack.pop()!;
				stack.push(b, c, a);
				break;
			}

			case OP_IFDUP: {
				const top = stack[stack.length - 1];
				if (!top) return false;
				const isTrue = top.some((b) => b !== 0);
				if (isTrue) stack.push(top);
				break;
			}

			case OP_TOALTSTACK: {
				const val = stack.pop();
				if (!val) return false;
				altStack.push(val);
				break;
			}

			case OP_FROMALTSTACK: {
				const val = altStack.pop();
				if (!val) return false;
				stack.push(val);
				break;
			}

			case OP_PICK: {
				const nBytes = stack.pop();
				if (!nBytes) return false;
				const n = nBytes[0]!; // simple encoding for now
				if (n >= stack.length) return false;
				stack.push(stack[stack.length - 1 - n]!);
				break;
			}

			case OP_ROLL: {
				const nBytes = stack.pop();
				if (!nBytes) return false;
				const n = nBytes[0]!; // simple encoding
				if (n >= stack.length) return false;
				const index = stack.length - 1 - n;
				const [item] = stack.splice(index, 1);
				stack.push(item!);
				break;
			}

			case OP_1ADD:
			case OP_1SUB:
			case OP_NEGATE:
			case OP_ABS:
			case OP_NOT:
			case OP_0NOTEQUAL: {
				const val = stack.pop();
				if (!val) return false;
				let num = decodeIntLE(val);

				switch (opcode) {
					case OP_1ADD:
						num += 1;
						break;
					case OP_1SUB:
						num -= 1;
						break;
					case OP_NEGATE:
						num = -num;
						break;
					case OP_ABS:
						num = Math.abs(num);
						break;
					case OP_NOT:
						num = num === 0 ? 1 : 0;
						break;
					case OP_0NOTEQUAL:
						num = num !== 0 ? 1 : 0;
						break;
				}
				stack.push(encodeIntLE(num));
				break;
			}

			case OP_ADD:
			case OP_SUB: {
				const b = stack.pop();
				const a = stack.pop();
				if (!a || !b) return false;
				const numA = decodeIntLE(a);
				const numB = decodeIntLE(b);
				const result = opcode === OP_ADD ? numA + numB : numA - numB;
				stack.push(encodeIntLE(result));
				break;
			}

			case OP_NUMEQUAL:
			case OP_NUMEQUALVERIFY:
			case OP_NUMNOTEQUAL:
			case OP_LESSTHAN:
			case OP_GREATERTHAN:
			case OP_LESSTHANOREQUAL:
			case OP_GREATERTHANOREQUAL:
			case OP_MIN:
			case OP_MAX: {
				const b = stack.pop();
				const a = stack.pop();
				if (!a || !b) return false;
				const numA = decodeIntLE(a);
				const numB = decodeIntLE(b);

				if (opcode === OP_NUMEQUALVERIFY) {
					if (numA !== numB) return false;
					break;
				}

				let result: number;
				switch (opcode) {
					case OP_NUMEQUAL:
						result = numA === numB ? 1 : 0;
						break;
					case OP_NUMNOTEQUAL:
						result = numA !== numB ? 1 : 0;
						break;
					case OP_LESSTHAN:
						result = numA < numB ? 1 : 0;
						break;
					case OP_GREATERTHAN:
						result = numA > numB ? 1 : 0;
						break;
					case OP_LESSTHANOREQUAL:
						result = numA <= numB ? 1 : 0;
						break;
					case OP_GREATERTHANOREQUAL:
						result = numA >= numB ? 1 : 0;
						break;
					case OP_MIN:
						result = Math.min(numA, numB);
						break;
					case OP_MAX:
						result = Math.max(numA, numB);
						break;
					default:
						return false;
				}
				stack.push(encodeIntLE(result));
				break;
			}

			case OP_WITHIN: {
				const max = stack.pop();
				const min = stack.pop();
				const x = stack.pop();
				if (!x || !min || !max) return false;
				const numX = decodeIntLE(x);
				const numMin = decodeIntLE(min);
				const numMax = decodeIntLE(max);
				const result = (numX >= numMin && numX < numMax) ? 1 : 0;
				stack.push(encodeIntLE(result));
				break;
			}

			case OP_IF:
			case OP_NOTIF: {
				if (stack.length === 0) return false;
				const top = stack.pop()!;
				const condition = top.some((byte) => byte !== 0);
				execStack.push(opcode === OP_IF ? condition : !condition);
				break;
			}

			case OP_ELSE: {
				if (execStack.length === 0) return false;
				const current = execStack.pop()!;
				execStack.push(!current);
				break;
			}

			case OP_ENDIF: {
				if (execStack.length === 0) return false;
				execStack.pop();
				break;
			}

			case OP_BOOLAND: {
				const b = stack.pop();
				const a = stack.pop();
				if (!a || !b) return false;
				const result = (a.some((x) => x !== 0) && b.some((x) => x !== 0)) ? 1 : 0;
				stack.push(new Uint8Array([result]));
				break;
			}

			case OP_BOOLOR: {
				const b = stack.pop();
				const a = stack.pop();
				if (!a || !b) return false;
				const result = (a.some((x) => x !== 0) || b.some((x) => x !== 0)) ? 1 : 0;
				stack.push(new Uint8Array([result]));
				break;
			}

			case OP_VERIFY: {
				const val = stack.pop();
				if (!val || !val.some((x) => x !== 0)) return false;
				break;
			}

			case OP_RETURN: {
				return false; // Always fails
			}

			case OP_CHECKMULTISIG: {
				const nRaw = stack.pop();
				if (!nRaw) return false;
				const n = decodeIntLE(nRaw);
				if (n < 0 || n > 20 || n > stack.length) return false;

				const pubkeys: Uint8Array[] = [];
				for (let i = 0; i < n; i++) {
					const key = stack.pop();
					if (!key) return false;
					pubkeys.push(key);
				}

				const mRaw = stack.pop();
				if (!mRaw) return false;
				const m = decodeIntLE(mRaw);
				if (m < 0 || m > n || m > stack.length) return false;

				const sigsWithType: Uint8Array[] = [];
				for (let i = 0; i < m; i++) {
					const sig = stack.pop();
					if (!sig) return false;
					sigsWithType.push(sig);
				}

				// Remove dummy (required by consensus rules)
				const dummy = stack.pop();
				if (!dummy) return false;

				let sigIndex = 0;
				let keyIndex = 0;
				let success = true;

				while (sigIndex < sigsWithType.length && success && keyIndex < pubkeys.length) {
					const sigWithType = sigsWithType[sigIndex]!;
					if (sigWithType.length < 1) {
						success = false;
						break;
					}

					const sighashType = sigWithType[sigWithType.length - 1]!;
					const sig = sigWithType.slice(0, -1);
					const subscript = ctx.subscript ??= getSubscript(script, sigWithType, ctx.lastCodeSep ?? 0);
					const messageHash = await computeSighash(ctx.tx, ctx.inputIndex, subscript, sighashType);

					if (!messageHash) {
						success = false;
						break;
					}

					let validSig = false;
					while (keyIndex < pubkeys.length && !validSig) {
						try {
							if (verify(sig, messageHash, pubkeys[keyIndex]!)) {
								validSig = true;
								sigIndex++;
							}
						} catch {
							// Ignore malformed signatures
						}
						keyIndex++;
					}

					if (!validSig) {
						success = false;
						break;
					}
				}

				success = success && sigIndex === sigsWithType.length;
				stack.push(new Uint8Array([success ? 1 : 0]));
				break;
			}

			case OP_CHECKLOCKTIMEVERIFY:
			case OP_CHECKSEQUENCEVERIFY: {
				const val = stack[stack.length - 1];
				if (!val) return false;
				// In real Bitcoin: check against nLockTime or nSequence
				// For now, we just treat them as NOPs unless you pass extra context
				break;
			}

			case OP_CODESEPARATOR: {
				ctx.lastCodeSep = pc - 1;
				break;
			}

			case OP_NOP:
			case OP_NOP1:
			// case OP_NOP2:
			// case OP_NOP3:
			case OP_NOP4:
			case OP_NOP5:
			case OP_NOP6:
			case OP_NOP7:
			case OP_NOP8:
			case OP_NOP9:
			case OP_NOP10: {
				// Do nothing
				break;
			}

			case OP_SIZE: {
				const top = stack[stack.length - 1];
				if (!top) return false;
				stack.push(encodeIntLE(top.length));
				break;
			}

			case OP_1NEGATE: {
				stack.push(encodeIntLE(-1));
				break;
			}

			case OP_SHA1: {
				const top = stack.pop();
				if (!top) return false;
				// TODO: Implement SHA1 once needed
				throw new Error("SHA1 not implemented");
			}

			case OP_SHA256: {
				const top = stack.pop();
				if (!top) return false;
				stack.push(sha256(top));
				break;
			}

			case OP_RIPEMD160: {
				const top = stack.pop();
				if (!top) return false;
				stack.push(ripemd160(top));
				break;
			}

			case OP_HASH256: {
				const top = stack.pop();
				if (!top) return false;
				stack.push(sha256(sha256(top)));
				break;
			}

			case OP_1:
			case OP_2:
			case OP_3:
			case OP_4:
			case OP_5:
			case OP_6:
			case OP_7:
			case OP_8:
			case OP_9:
			case OP_10:
			case OP_11:
			case OP_12:
			case OP_13:
			case OP_14:
			case OP_15:
			case OP_16: {
				const n = opcode - OP_1 + 1;
				stack.push(encodeIntLE(n));
				break;
			}

			case OP_RESERVED: {
				return false; // Always fails
			}

			default:
				// Ensure all opcodes are handled
				({} as OP_CODES_REVERSE[typeof opcode]) satisfies never;
				throw new Error(`Unknown opcode: 0x${(opcode as number).toString(16)}`);
		}
	}

	return true;
}
