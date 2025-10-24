# BitcoinMonolith

Experimental Bitcoin node and client. Still a work in progress, not ready for real use.

For learning, hacking, or just messing around (for now). Still way too early.

Fully made in all verifiable Deno and TypeScript. (so its friendly for even more devs)

Main goal is to optimize for storage (reducing indexed full node size more than half).

Prioritizing UX and simplicity, end user expected to be normal everyday bitcoin user.

We are not trying to change bitcoin, we are simply allowing you to use bitcoin the best way you can, easily, while requiring less storage.

## Notes

- The whole codebase uses wire format internally, so there is no `.reverse()` or `.toReversed()` in the whole codebase
  except for making things like console logs human readable.
- We call original implementation of bitcoin and anything legacy as "satoshi". For example, Satoshi Client, Satoshi RPC,
  Satoshi TPC or Satoshi P2P, satoshiMerkleRoot, satoshi address type.
- Another thing is, internally we use 4MB as max block weight. Witness is weighted 1x, and non-witness data is weighted
  4x.

## Long Term Goals:

- Be a full node with storage optimization.
- Support Satoshi RPC endpoints.
- Support Electrum endpoints.
- Web App interface on the localhost.
  - And have a webview as app gui.
  - Have a mempoolspace like explorer built-in.
  - Have isolated wasm plugin support for mempool filters and many other things. For example DATUM.
  - Have plugin store on nostr.
  - Built-in plugins: DATUM, filtering plugins, delay propagation of blocks that doesnt fit into your filters based on
    weight of bad txs, delay like 5mins or 10mins idk. 1 hour?
- And way down the line, when everything is done, have a new communication protocol over http and websockets. It can
  also have PoW requirement support for read requests.
- Unlike Satoshi clients, this will be able to work out of the box without being have to download the whole chain.
  - So it can act like a light client, and download missing block data on demand.
  - So let's say you are browing the explorer and scrolling the block list, it will download the block data on demand.
  - It will still validate block data and handle chain reorganizations.
  - But at the same time it will have background workers that will download the missing block data with any bandwidth
    cap you set from genesis to the tip of the chain.
  - At the end of the day, it will have the whole chain downloaded and validated. But you dont have to wait for chain
    the sync fully to use the client.
- Another long term goal is making it work on mobile devices, but for that we need even better storage optimizations.
- You should be able to do anything bitcoin related with this client, without needing to setup complex third party
  software, and making sure everything connects to each other properly. It will do everything with plugins and built-in
  features.
- So your grandma can run a useful node.
