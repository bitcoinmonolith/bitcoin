import { assertEquals } from "jsr:@std/assert";
import { executeScript } from "./execute.ts";
import {
	OP_0,
	OP_0NOTEQUAL,
	OP_1,
	OP_1ADD,
	OP_1NEGATE,
	OP_2,
	OP_2DROP,
	OP_2DUP,
	OP_3,
	OP_ADD,
	OP_BOOLAND,
	OP_BOOLOR,
	OP_DROP,
	OP_DUP,
	OP_ELSE,
	OP_ENDIF,
	OP_EQUAL,
	OP_EQUALVERIFY,
	OP_IF,
	OP_LESSTHAN,
	OP_MIN,
	OP_NOT,
	OP_NUMEQUAL,
	OP_NUMEQUALVERIFY,
	OP_RETURN,
	OP_SUB,
	OP_VERIFY,
	OPCODE_TABLE_GENESIS,
} from "./GENESIS.ts";

// Helper to push raw bytes with length prefix
function push(data: Uint8Array): Uint8Array {
	return new Uint8Array([data.byteLength, ...data]);
}

// Mock transaction
const mockTx = {
	version: 1,
	inputs: [{
		txid: new Uint8Array(32),
		vout: 0,
		scriptSig: new Uint8Array(),
		sequence: 0xffffffff,
		prevOutput: Promise.resolve({
			value: 0n,
			scriptPubKey: new Uint8Array(),
		}),
	}],
	outputs: [{
		value: 0n,
		scriptPubKey: new Uint8Array(),
	}],
	locktime: 0,
};

Deno.test("Basic arithmetic script", async () => {
	const script = new Uint8Array([
		OP_1,
		OP_2,
		OP_ADD,
		0x03,
		OP_EQUAL,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Invalid arithmetic script", async () => {
	const script = new Uint8Array([
		OP_1,
		OP_2,
		OP_ADD,
		0x04,
		OP_EQUAL,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, false);
});

Deno.test("Data push operation", async () => {
	const bytes = new Uint8Array([0xab, 0xcd]);
	const script = new Uint8Array([
		...push(bytes),
		...push(bytes),
		OP_EQUAL,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Stack underflow", async () => {
	const script = new Uint8Array([
		OP_1,
		OP_ADD,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, false);
});

Deno.test("Stack operations", async () => {
	const script = new Uint8Array([
		OP_1,
		OP_2,
		OP_3,
		OP_3,
		OP_2DROP,
		OP_2DUP,
		OP_ADD,
		0x03,
		OP_EQUAL,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Multiple push operations", async () => {
	const script = new Uint8Array([
		0x01,
		0x03,
		OP_3,
		OP_EQUAL,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Boolean operations", async () => {
	const script = new Uint8Array([
		OP_1,
		OP_2,
		OP_LESSTHAN,
		0x01,
		OP_EQUAL,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Conditional execution", async () => {
	const script = new Uint8Array([
		OP_1,
		OP_IF,
		OP_2,
		OP_3,
		OP_ADD,
		0x05,
		OP_EQUAL,
		OP_ENDIF,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Conditional false branch", async () => {
	const script = new Uint8Array([
		0x00,
		OP_IF,
		OP_1,
		OP_2,
		OP_ADD,
		OP_ENDIF,
		OP_1,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("DROP removes item", async () => {
	const script = new Uint8Array([
		OP_1,
		OP_2,
		OP_DROP,
		OP_1,
		OP_EQUAL,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("DUP duplicates top item", async () => {
	const script = new Uint8Array([
		OP_2,
		OP_DUP,
		OP_EQUALVERIFY,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("VERIFY fails on false", async () => {
	const script = new Uint8Array([
		0x00,
		OP_VERIFY,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, false);
});

Deno.test("Nested IF branches", async () => {
	// Script: 1 IF 1 IF 2 2 EQUALVERIFY ENDIF ENDIF
	const script = new Uint8Array([
		OP_1,
		OP_IF,
		OP_1,
		OP_IF,
		OP_2,
		OP_2,
		OP_EQUALVERIFY,
		OP_ENDIF,
		OP_ENDIF,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("IF with falsy input skips nested code", async () => {
	// Script: 0 IF 2 2 EQUAL ENDIF 1
	const script = new Uint8Array([
		0x00,
		OP_IF,
		OP_2,
		OP_2,
		OP_EQUAL,
		OP_ENDIF,
		OP_1,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true); // Final stack: [1]
});

Deno.test("Equal with different data", async () => {
	const a = new Uint8Array([0xab]);
	const b = new Uint8Array([0xcd]);
	const script = new Uint8Array([
		...push(a),
		...push(b),
		OP_EQUAL,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, false);
});

Deno.test("Equal with long identical data", async () => {
	const longData = crypto.getRandomValues(new Uint8Array(64));
	const script = new Uint8Array([
		...push(longData),
		...push(longData),
		OP_EQUAL,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Empty script = invalid stack", async () => {
	const script = new Uint8Array([]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, false);
});

Deno.test("Multiple true values = valid final stack, pre segwit", async () => {
	const script = new Uint8Array([
		OP_1,
		OP_1,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true); // Two values on stack = invalid
});

Deno.test("OP_EQUALVERIFY fails on mismatch", async () => {
	const script = new Uint8Array([
		OP_1,
		OP_2,
		OP_EQUALVERIFY,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, false);
});

Deno.test("Drop to empty then push true", async () => {
	const script = new Uint8Array([
		OP_1,
		OP_DROP,
		OP_1,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true); // Final stack: [1]
});

Deno.test("OP_2DROP with insufficient stack", async () => {
	const script = new Uint8Array([
		OP_1,
		OP_2DROP,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, false);
});

Deno.test("Full logic combo: if/dup/add/equal/drop", async () => {
	// Script: 1 DUP IF 2 ADD 3 EQUALVERIFY ENDIF DROP 1
	const script = new Uint8Array([
		OP_1, // 1
		OP_DUP, // 1 1
		OP_IF, // true
		OP_2, // 1 1 2
		OP_ADD, // 1 3
		0x03, // push 3
		OP_EQUALVERIFY, // 1 (because 3 == 3)
		OP_ENDIF, //
		OP_DROP, // empty
		OP_1, // 1
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true); // final stack: [1]
});

Deno.test("Advanced: multiple branches + 2DUP + comparison", async () => {
	// Script: 1 1 EQUAL IF 2 3 2DUP ADD 5 EQUALVERIFY ENDIF 1
	const script = new Uint8Array([
		OP_1,
		OP_1,
		OP_EQUAL, // 1 (true)
		OP_IF,
		OP_2,
		OP_3,
		OP_2DUP, // 2 3 2 3
		OP_ADD, // 2 3 5
		0x05,
		OP_EQUALVERIFY, // check 5 == 5
		OP_ENDIF,
		OP_1,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Push multiple, stack cleanup, arithmetic, truth", async () => {
	// Script: 1 2 3 2DROP 1 ADD 2 EQUAL
	const script = new Uint8Array([
		OP_1,
		OP_2,
		OP_3,
		OP_2DROP, // drops 3 and 2 → leaves 1
		OP_1,
		OP_ADD, // 1 + 1 → 2
		OP_2,
		OP_EQUAL, // true
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Deep logic: multiple conditionals + DROP + VERIFY", async () => {
	// Script: 1 IF 1 1 EQUAL IF 2 2 EQUALVERIFY ENDIF ENDIF 1
	const script = new Uint8Array([
		OP_1,
		OP_IF,
		OP_1,
		OP_1,
		OP_EQUAL,
		OP_IF,
		OP_2,
		OP_2,
		OP_EQUALVERIFY,
		OP_ENDIF,
		OP_ENDIF,
		OP_1,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Mismatched EQUALVERIFY inside IF (should fail)", async () => {
	// Script: 1 IF 2 3 EQUALVERIFY ENDIF
	const script = new Uint8Array([
		OP_1,
		OP_IF,
		OP_2,
		OP_3,
		OP_EQUALVERIFY,
		OP_ENDIF,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, false);
});

Deno.test("Push long data, drop, add, compare", async () => {
	const junk = crypto.getRandomValues(new Uint8Array(10));
	const script = new Uint8Array([
		...push(junk), // junk
		OP_DROP, // discard junk
		OP_2,
		OP_1,
		OP_ADD, // 2 + 1
		0x03,
		OP_EQUAL,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Arithmetic and comparison full logic", async () => {
	const script = new Uint8Array([
		OP_2,
		OP_1,
		OP_SUB, // 2 - 1 = 1
		OP_1ADD, // 1 + 1 = 2
		OP_2,
		OP_NUMEQUALVERIFY, // 2 == 2 -> continue

		OP_3,
		OP_2,
		OP_SUB, // 3 - 2 = 1
		OP_1NEGATE,
		OP_ADD, // 1 + (-1) = 0
		OP_0NOTEQUAL, // 0 → false

		OP_NOT, // 0 → 1
		OP_1,
		OP_NUMEQUALVERIFY, // 1 == 1
		OP_2,
		OP_2,
		OP_MIN, // 2 2 → min = 2
		OP_2,
		OP_NUMEQUAL, // = true
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Control flow and nesting", async () => {
	const script = new Uint8Array([
		OP_1,
		OP_IF,
		OP_2,
		OP_IF,
		OP_1,
		OP_1,
		OP_EQUALVERIFY,
		OP_ELSE,
		OP_RETURN, // Should never run
		OP_ENDIF,
		OP_ENDIF,
		OP_1,
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Boolean logic: AND, OR", async () => {
	const script = new Uint8Array([
		OP_1,
		OP_1,
		OP_BOOLAND, // 1 && 1 = 1
		OP_1,
		OP_BOOLOR, // 1 || 1 = 1
		OP_1,
		OP_EQUALVERIFY, // 1 == 1
		OP_0,
		OP_1,
		OP_BOOLOR, // 0 || 1 = 1
		OP_1,
		OP_EQUAL, // Should be true
	]);
	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});
