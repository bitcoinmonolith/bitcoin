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

Also it seems we need to store the full txid once per tx. otherwise while reconstructing tx vins, we have to rehash
every tx until the utxo coinbase.

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
- We verify their timestamp.
- We verify their difficulty target.
- We verify their link to previous block.
- We also verify txs and if they are double spends or not.
- But we dont hash anything in this stage. this is the only sequential stage.

Then we store them in the storage one by one.

# Last Thoughts

Ok we did verifying header and its PoW part. and stuff.

So now its time to download txs and verify them.

Two things we are gonna do for now is, verify the merkle root and verify txs are not double spending.

We are not gonna calculate merkele root in parallel.\
BUT we are gonna calculate blocks in parallel.

Ok so first we need to download blocks and their txs.

Then we skip the header part, and just verify the merkle root.

Then we verify txs are not double spending (in the same tx for now).

Then we have to actually store the txs in a different file. or files.

So we save txs raw in to a file. but we chunk files based on their size.

In this step we are point to everything by index or offset no hashes.

Because hash based order decided by headers already. and we store the headers in memory anyway and also on disk.

So as we walk the downloaded blocks and their txs. we one by one append txs to the file. Also we include the txCount in
this file as well before the block's txs.

So as we write to this file. lets say while writing the the txCount, we get its offset in the file and create an index.
Saying blockHeight -> chunkId, offset.

Then as we write each tx, we get its offset and create an index saying txid -> blockHeight, offset. Since blocks are
under 4mb we can use u24 for offset. and since u24 is big enough we can also use it for block height.

so from a block height we can get its txs. and from a txid we can get its block and offset.

Then we can read the file and get the txs or tx.

So when we see a vin spending a vout, we find that tx, fetch its bytes, dont full decode it but walk it to find the vout
offset.

so a vin on the disk points to a blockHeight+voutOffset.

so we can reach the vout easily.

this is the next step.

only thing parallel here is verifying merkle root and txs in a block.

we check double spends sequentially. as well as storing them.

we first get maybe like 100 blocks in memory.

when we verify them in parallel. we do sequentially index and verify them and store them.

after doing these you can delete this TODO file.
