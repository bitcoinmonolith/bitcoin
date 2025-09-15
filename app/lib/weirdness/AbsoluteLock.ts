// ----- types -----

// absolute lock (tx-wide, nLockTime)
export type AbsoluteLock =
	| { kind: "none" } // locktime = 0
	| { kind: "block"; height: number } // block height
	| { kind: "time"; timestamp: number }; // unix timestamp

// ----- absolute lock (tx-wide) -----
export namespace AbsoluteLock {
	export function decode(locktime: number): AbsoluteLock {
		if (locktime === 0) return { kind: "none" };
		if (locktime < 500_000_000) return { kind: "block", height: locktime };
		return { kind: "time", timestamp: locktime };
	}

	export function encode(abs: AbsoluteLock): number {
		switch (abs.kind) {
			case "none":
				return 0;
			case "block":
				return abs.height;
			case "time":
				return abs.timestamp;
		}
	}
}
