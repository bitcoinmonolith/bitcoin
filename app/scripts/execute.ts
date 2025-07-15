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
		script: script,
		tx: tx,
		inputIndex: inputIndex,
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

			if (ctx.execStack.includes(false)) {
				console.log("Skipping execution due to false in execStack");
				continue;
			}

			// Handle data push opcodes (0x01-0x4b)
			if (opcode > 0x00 && opcode < 0x4c) {
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
			} else if (opcode === 0x00) {
				console.log("Handling OP_0 explicitly");
				// Handle OP_0 explicitly
				ctx.stack.push(new Uint8Array([]));
			} else {
				console.log("Executing opcode:", opcode);
				// Execute opcode from table
				const handler = table[opcode];
				if (!handler) return false;

				const result = await Promise.resolve(handler(ctx));
				if (!result) return false;
			}
		}

		// Script succeeded if stack has at least one item and top item is truthy
		if (ctx.stack.length === 0) return false;
		const top = ctx.stack[ctx.stack.length - 1]!;
		return top.length > 0 && top[0] !== 0;
	} catch (error) {
		console.error("Script execution error:", error);
		return false;
	}
}
