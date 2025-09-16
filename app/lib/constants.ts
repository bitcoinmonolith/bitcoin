import { resolve } from "@std/path";
import { hexToBytes } from "@noble/hashes/utils";

export const DATA_BASE_DIR = resolve("./data");

export const MAX_BLOCK_BYTES = 4 * 1024 * 1024; // 4 MiB

export const GENESIS_BLOCK_HASH = hexToBytes("000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f")
	.reverse();
