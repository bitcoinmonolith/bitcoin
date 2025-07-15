import { Tx } from "../types/Tx.ts";
import { OPCODE_CONTEXT, OPCODE_TABLE } from "./GENESIS.ts";

export async function executeScript(
	table: OPCODE_TABLE,
	script: Uint8Array,
	tx: Tx,
	inputIndex: number,
): Promise<boolean> {
	const ctx: OPCODE_CONTEXT = {
		pc: 0,
		table,
		script,
		tx,
		inputIndex,
		stack: [],
		altStack: [],
		execStack: [],
		execute(script) {
			return executeScript(table, script, tx, inputIndex);
		},
	};

	try {
		for (; ctx.pc < script.length; ctx.pc++) {
			const opcode = script[ctx.pc]!;
			console.log("Executing opcode:", opcode, "at pc:", ctx.pc);

			// Check if we should execute this opcode based on execution stack
			const shouldExecute = ctx.execStack.every((b) => b);

			// Handle data push opcodes (0x01-0x4b)
			if (opcode > 0x00 && opcode < 0x4c) {
				if (shouldExecute) {
					// Check if we're at the end of the script or there's no room for data push
					if (ctx.pc + 1 >= script.length || opcode >= script.length - ctx.pc - 1) {
						// If at end or not enough bytes, treat as numeric value
						console.log("Pushing numeric value:", opcode);
						ctx.stack.push(new Uint8Array([opcode]));
					} else {
						// Otherwise treat as data push
						const data = script.slice(ctx.pc + 1, ctx.pc + 1 + opcode);
						console.log("Pushing data:", [...data]);
						ctx.stack.push(data);
						ctx.pc += opcode;
					}
				} else {
					// Skip the data push but still advance pc correctly
					if (ctx.pc + 1 < script.length && opcode < script.length - ctx.pc - 1) {
						ctx.pc += opcode;
					}
				}
			} else {
				// Execute opcode from table
				const handler = table[opcode];
				if (!handler) return false;

				// Always execute control flow opcodes, conditionally execute others
				if (shouldExecute || opcode === 0x63 || opcode === 0x67 || opcode === 0x68) { // IF, ELSE, ENDIF
					console.log("Actually executing handler for opcode:", opcode);
					await Promise.resolve(handler(ctx)).then(() => true);
				} else {
					console.log("Skipping execution of opcode:", opcode, "due to execStack");
				}
			}
		}

		if (ctx.stack.length === 0) {
			console.log("Script failed: empty stack");
			return false;
		}

		const top = ctx.stack[ctx.stack.length - 1]!;
		console.log("Final stack top:", [...top]);
		const result = isTruthy(top);
		console.log("Final script result:", result);
		return result;
	} catch (error) {
		console.error("Script execution error:", error);
		return false;
	}
}

function isTruthy(value: Uint8Array): boolean {
	if (value.length === 0) return false;

	for (let i = 0; i < value.length; i++) {
		const byte = value[i];

		// If non-zero:
		if (byte !== 0) {
			// Special case: single 0x80 or multi-byte ending in 0x80 = -0
			if (byte === 0x80 && i === value.length - 1) {
				// Make sure all preceding bytes are 0
				for (let j = 0; j < value.length - 1; j++) {
					if (value[j] !== 0) return true;
				}
				return false;
			}
			return true;
		}
	}

	// All bytes are 0
	return false;
}
