/// <reference lib="deno.worker" />

import { join } from "@std/path";
import { BlocksJobData, BlocksJobResult } from "~/lib/chain/workers/blocks.parallel.ts";
import { BASE_DATA_DIR } from "~/lib/constants.ts";
import { JobPool } from "~/lib/JobPool.ts";

const BASE_BLOCK_DIR = join(BASE_DATA_DIR, "blocks");

const jobPool = new JobPool<BlocksJobData, BlocksJobResult>(import.meta.resolve("./blocks.parallel.ts"));

/*
	Blocks are chunked, chunks are not based on height, but on size.
	It will proably will be 1GB per chunk,
	chunks need to be big enough, so chunkId can be u16.
	And chunks can should be small enough,
	so maybe we can compress them in the future. (a compression that optimizes for speed)
	Also thats why I think about seperating witness data to another file,
	so compression can get better patterns.
	We have a fixed sized BlockHeightIndex,
	that we can directly check what chunkId and offset a block or tx is at.

	Chunk structure looks like this:
	[Tx Count: u24]
	[StoredCoinbaseTx]
	[StoredTx]
	[StoredTx]
	...
	[StoredTx]
	[Tx Count: u24]
	[StoredCoinbaseTx]
	[StoredTx]
	[StoredTx]
	...

	So as you can see, it only stores the txs,
	because we already store the headers in headers.dat file.
	And also headers always live in memory as well.

	So BlockHeightIndex points to the start of Tx Count of the chunk.
	That way a block can know how many of the following txs are its txs.

	vin pointing to prevout dont care about the block,
	so it directly points to chunkId and offset of the tx.
	it doesnt point to the output directly,
	because we need to know the txId as well,
	in order to reconstruct the on wire tx.

	Max chunk size can be changed dynamically in the future,
	and wouldn't require a reindex,
	because it only decides when to start a new chunk.
*/

self.onmessage = async (event) => {
};
