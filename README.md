# Bitcoin

Experimental Bitcoin node and client. Still a work in progress, not ready for real use.

For learning, hacking, or just messing around (for now). Still way too early to, so don't be judgmental. Just messing around. 

Fully made in Deno and TypeScript.

Main goal is to optimize for storage while not sacrificing performance, reducing indexed blockchain size more than half. 

Later goals after making sure everything implemented correctly: 
- Support Satoshi RPC endpoints.
- Support Electrum endpoints.
- Web App interface on the localhost.
- And have a webview as app gui. 
- Have a mempoolspace like explorer built-in.
- Have isolated wasm plugin support for mempool filters and many other things. For example DATUM.
- Have plugin store on nostr.


## Notes

- The whole codebase uses wire format internally, so there is no `.reverse()` or `.toReversed()` in the whole codebase
  except for console logging.
- We call original implementation of bitcoin and anything legacy as "satoshi". For example, Satoshi Client, Satoshi RPC, Satoshi TPC, satoshiMerkleRoot, satoshi address type.
- Another thing is, internally we use 4MB as max block weight. Witness is weighted 1x, and non-witness data is weighted 4x.
