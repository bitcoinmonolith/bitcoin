import { OPCODE_DUPLICATES, OPCODE_TABLE, OPCODE_TABLE_GENESIS } from "./GENESIS.ts";

export const BIP_65_ACTIVATION_HEIGHT = 388381; // Mainnet activation height for BIP 65

type ThisModule = typeof import("./BIP_65.ts");
type OP_CODES = Pick<ThisModule, keyof ThisModule & `OP_${string}`>;
// Ensure that OP_CODES has unique values
({} as OPCODE_DUPLICATES<OP_CODES>) satisfies never;

export const OPCODE_TABLE_BIP_65: OPCODE_TABLE = [...OPCODE_TABLE_GENESIS];

export const OP_CHECKLOCKTIMEVERIFY = 0xb1; // formerly OP_NOP2
OPCODE_TABLE_BIP_65[OP_CHECKLOCKTIMEVERIFY] = ({ stack, tx }) => {
	// Stack must have at least one item
	if (stack.length < 1) return false;

	// Get locktime from stack without removing it
	const nLocktime = stack[stack.length - 1]![0]!;

	// Validation rules:
	// 1. Stack value must not be negative
	if (nLocktime < 0) return false;

	// 2. Transaction must not be finalized (sequence must not be max)
	if (tx.inputs.some((input) => input.sequence === 0xffffffff)) return false;

	// 3. Stack and transaction locktime type mismatch check
	const stackLockTimeType = nLocktime >= 500_000_000;
	const txLockTimeType = tx.locktime >= 500_000_000;
	if (stackLockTimeType !== txLockTimeType) return false;

	// 4. Transaction locktime must be greater or equal to stack locktime
	if (tx.locktime < nLocktime) return false;

	return true;
};
