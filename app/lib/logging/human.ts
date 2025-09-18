import { bytesToHex } from "@noble/hashes/utils";

export function toHumanReadable(value: unknown): unknown {
	if (value instanceof Uint8Array) {
		return bytesToHex(value.toReversed());
	}

	if (typeof value === "bigint") {
		return value.toString();
	}

	if (typeof value === "number") {
		return `0x${value.toString(16)}`;
	}

	if (Array.isArray(value)) {
		return value.map(toHumanReadable);
	}

	if (value && typeof value === "object") {
		const obj: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			obj[k] = toHumanReadable(v);
		}
		return obj;
	}
	return value;
}
