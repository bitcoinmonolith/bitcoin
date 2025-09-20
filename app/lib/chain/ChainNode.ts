export type ChainNode = Readonly<{
	hash: Uint8Array;
	header: Uint8Array;
	cumulativeWork: bigint;
}>;
