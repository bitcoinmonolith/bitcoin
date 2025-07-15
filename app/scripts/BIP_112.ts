import { OPCODE_TABLE_BIP_65 } from "./BIP_65.ts";
import { OPCODE_DUPLICATES, OPCODE_TABLE } from "./GENESIS.ts";

export const BIP_112_ACTIVATION_HEIGHT = 481824; // Mainnet activation height for BIP 112

type ThisModule = typeof import("./BIP_112.ts");
type OP_CODES = Pick<ThisModule, keyof ThisModule & `OP_${string}`>;
// Ensure that OP_CODES has unique values
({} as OPCODE_DUPLICATES<OP_CODES>) satisfies never;

export const OPCODE_TABLE_BIP_112: OPCODE_TABLE = [...OPCODE_TABLE_BIP_65];

export const OP_CHECKSEQUENCEVERIFY = 0xb2; // formerly OP_NOP3
OPCODE_TABLE_BIP_112[OP_CHECKSEQUENCEVERIFY] = ({ stack, tx }) => {
	// Stack must have at least one item
	if (stack.length < 1) return false;

	// Get sequence value from stack without removing it
	const nSequence = stack[stack.length - 1]![0]!;

	// Validation rules:
	// 1. Stack value must not be negative
	if (nSequence < 0) return false;

	// 2. Sequence number type mask (1 << 31)
	const SEQUENCE_LOCKTIME_TYPE_FLAG = 0x80000000;
	// Transaction version must be 2 or greater
	if (tx.version < 2) return false;

	// 3. Skip if all inputs have sequence = UINT_MAX (0xffffffff)
	if (tx.inputs.every((input) => input.sequence === 0xffffffff)) {
		return true;
	}

	// 4. Sequence number mask
	const SEQUENCE_LOCKTIME_MASK = 0x0000ffff;

	// Get the type of sequence lock from nSequence
	const txToSequenceType = (tx.inputs[0]?.sequence ?? 0) & SEQUENCE_LOCKTIME_TYPE_FLAG;
	const nSequenceType = nSequence & SEQUENCE_LOCKTIME_TYPE_FLAG;

	// Type mismatch - one is time-based, the other is block-based
	if (txToSequenceType !== nSequenceType) return false;

	// Compare masked values - nSequence must be less than or equal to input's sequence
	const nMasked = nSequence & SEQUENCE_LOCKTIME_MASK;
	const txToMasked = (tx.inputs[0]?.sequence ?? 0) & SEQUENCE_LOCKTIME_MASK;

	if (nMasked > txToMasked) return false;

	return true;
};
