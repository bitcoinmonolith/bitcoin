// per-input relative lock (nSequence, BIP-68/112)
export type RelativeLock =
	| { kind: "none" }
	| { kind: "blocks"; blocks: number }
	| { kind: "time"; seconds: number };

// replace-by-fee signalling (BIP-125)
export type ReplaceByFee = "enabled" | "disabled";

export type SequenceLock = {
	relative: RelativeLock;
	rbf: ReplaceByFee;
	raw: number; // original raw nSequence value
};

export namespace SequenceLock {
	const SEQUENCE_FINAL = 0xffffffff;
	const RBF_ONLY = 0xfffffffe; // canonical RBF sentinel
	const DISABLE_FLAG = 1 << 31;
	const TYPE_FLAG = 1 << 22;
	const VALUE_MASK = 0xffff;

	export function decode(sequence: number): SequenceLock {
		let relative: RelativeLock = { kind: "none" };

		if (sequence !== SEQUENCE_FINAL && sequence !== RBF_ONLY) {
			const disable = (sequence & DISABLE_FLAG) !== 0;
			const isTime = (sequence & TYPE_FLAG) !== 0;
			const value = sequence & VALUE_MASK;

			if (!disable) {
				relative = isTime ? { kind: "time", seconds: value * 512 } : { kind: "blocks", blocks: value };
			}
		}

		// RBF is enabled if it's strictly less than final (0xffffffff)
		const rbf: ReplaceByFee = sequence !== SEQUENCE_FINAL ? "enabled" : "disabled";

		return { relative, rbf, raw: sequence };
	}

	export function encode(sequenceLock: SequenceLock): number {
		return sequenceLock.raw;
	}
}
