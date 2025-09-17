# Storage

We should create bulk block blobs and store them raw on the file system.

We should point to txs and blocks, by bulk blob chunk id and offset.

We shouldn't have a Block codec, instead instead we should encode, append to file and index offsets in a single
function.

So we encode header, txs and while during encoding them we apppend to file one by one and index offsets.

This way everything should be more optimized.

Another thing is we can have a table of last access to these blobs, so if one is not accessed for a long time we can
compress it using general purpose compression.

Assuming we only access them only when viewed in block explorer or for vout lookups. We shouldn't read old blocks that
much at all. so i think this might be a good idea.

Btw we still use our KV solution for indexes.

# Speed

Ok this works. we can work on this more. Now we need some pooled queue pipe.

Meaning we need some work pipes that can work on their items in parallel.

> Note: This is gonna be basics stil but we can add other pipelines later.

So first we download the blocks, order doesnt really matter. but we download them in order then:

- We first calculate header hashes.
- We verify their merkle root.
- We temporarily index them by their previous block hash.

- Verifying merkle root itself also creates in parallel jobs of calculating txids and indexing them by their txid
  prefixes.

The Next pipeline get them from previous pool that is indexed by previous block hash. And then:

- We verify their POW.
