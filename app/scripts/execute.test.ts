import { secp256k1 } from "@noble/curves/secp256k1";
import { ripemd160 } from "@noble/hashes/legacy";
import { sha256 } from "@noble/hashes/sha2";
import { assertEquals } from "jsr:@std/assert";
import { executeScript } from "./execute.ts";
import {
	OP_1,
	OP_2,
	OP_2DROP,
	OP_2DUP,
	OP_3,
	OP_ADD,
	OP_CHECKMULTISIG,
	OP_CHECKSIG,
	OP_DUP,
	OP_ENDIF,
	OP_EQUAL,
	OP_EQUALVERIFY,
	OP_HASH160,
	OP_IF,
	OP_LESSTHAN,
	OPCODE_TABLE_GENESIS,
} from "./GENESIS.ts";

// Mock transaction for testing
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
	// Script: 1 2 ADD 3 EQUAL
	const script = new Uint8Array([
		OP_1,
		OP_2,
		OP_ADD,
		0x03, // Push number 3
		OP_EQUAL,
	]);

	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Invalid arithmetic script", async () => {
	// Script: 1 2 ADD 4 EQUAL
	const script = new Uint8Array([
		OP_1,
		OP_2,
		OP_ADD,
		0x04, // Push number 4
		OP_EQUAL,
	]);

	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, false);
});

Deno.test("Data push operation", async () => {
	// Script that pushes data and compares it
	const script = new Uint8Array([
		0x02, // Push 2 bytes
		0xab,
		0xcd, // The bytes to push
		0x02, // Push 2 bytes again
		0xab,
		0xcd, // Same bytes
		OP_EQUAL, // Compare them
	]);

	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Stack underflow", async () => {
	// Script that tries to ADD with insufficient stack items
	const script = new Uint8Array([
		OP_1,
		OP_ADD, // Stack underflow here
	]);

	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, false);
});

Deno.test("Stack operations", async () => {
	// Script: 1 2 3 3 2DROP 2DUP ADD 3 EQUAL
	const script = new Uint8Array([
		OP_1,
		OP_2,
		OP_3,
		OP_3,
		OP_2DROP, // Stack: 1 2
		OP_2DUP, // Stack: 1 2 1 2
		OP_ADD, // Stack: 1 2 3
		0x03, // Push 3
		OP_EQUAL, // Stack: 1 2 true
	]);

	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Multiple push operations", async () => {
	// Script pushes same data multiple ways and compares
	const script = new Uint8Array([
		0x01,
		0x03, // Push single byte 3
		OP_3, // Push 3 using opcode
		OP_EQUAL, // Should be equal
	]);

	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Boolean operations", async () => {
	// Script: 1 2 LESSTHAN 1 EQUAL
	const script = new Uint8Array([
		OP_1,
		OP_2,
		OP_LESSTHAN, // Should push 1 (true)
		0x01, // Push 1
		OP_EQUAL,
	]);

	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("Conditional execution", async () => {
	// Script: 1 IF 2 3 ADD 5 EQUAL ENDIF
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

// Replace mock key helpers with real ones

const TEST_PRIVKEY = secp256k1.utils.randomPrivateKey(); // Simple private key for testing
const TEST_PUBKEY = secp256k1.getPublicKey(TEST_PRIVKEY); // Real public key
// Create signature with SIGHASH_ALL (0x01)
const TEST_MESSAGE = new Uint8Array(32).fill(2); // Example message to sign
const TEST_SIG = new Uint8Array([
	...secp256k1.sign(TEST_MESSAGE, TEST_PRIVKEY).toDERRawBytes(),
	0x01, // SIGHASH_ALL
]);

Deno.test("OP_CHECKSIG verification", async () => {
	const script = new Uint8Array([
		0x21, // Push 33 bytes (pubkey)
		...TEST_PUBKEY,
		0x21, // Push 33 bytes (signature)
		...TEST_SIG,
		OP_CHECKSIG,
	]);

	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("OP_CHECKMULTISIG verification", async () => {
	const script = new Uint8Array([
		OP_2, // Number of signatures required
		0x21, // Push 33 bytes (pubkey1)
		...TEST_PUBKEY,
		0x21, // Push 33 bytes (pubkey2)
		...TEST_PUBKEY,
		OP_2, // Number of pubkeys
		OP_CHECKMULTISIG,
	]);

	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

Deno.test("P2PKH script with real keys", async () => {
	const pubkeyHash = hash160(TEST_PUBKEY); // Real HASH160 of pubkey

	const script = new Uint8Array([
		TEST_SIG.byteLength, // Push 33 bytes (signature)
		...TEST_SIG,
		TEST_PUBKEY.byteLength, // Push 33 bytes (pubkey)
		...TEST_PUBKEY,
		OP_DUP,
		OP_HASH160,
		pubkeyHash.byteLength, // Push 20 bytes
		...pubkeyHash,
		OP_EQUALVERIFY,
		OP_CHECKSIG,
	]);

	const result = await executeScript(OPCODE_TABLE_GENESIS, script, mockTx, 0);
	assertEquals(result, true);
});

// Helper function to perform HASH160 (SHA256 + RIPEMD160)
function hash160(data: Uint8Array): Uint8Array {
	const sha = sha256(data);
	return ripemd160(sha);
}
