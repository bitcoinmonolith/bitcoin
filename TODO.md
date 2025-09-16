## TODO

- [x] Satoshi P2P communication protocol
- [x] Encode/Decode Blocks and Transactions
- [x] Satoshi's Merkle root computation
- [ ] Storage layer using KV sqlite3 files, and have in-memory cache for everything.
  - [ ] Storing blocks raw, but use a different codec that uses internal ids for TXs and prevouts to save space.
  - [ ] Blocks are stored by height in chunks, so we can know where to look for them.
  - [ ] Another thing is instead of having internal ids for txs we can also use their offset in the block while pointing
        to them.
  - [ ] We still have to store txIds and block hashes though, so we can find them. BUT instead of storing full hashes we
        can store the shortest unique prefix. once we find them by prefix we can rehash the full thing to make sure it's
        the same. Of course these are also cashed in storage and memory with a size limit.
  - [ ] prev vouts can also be pointed at by block height + vout byte offset, instead of txId + vout index.
  - [ ] UTXO is not stored separately, instead we just mark the vout as spent in the block it was created in. This way
        we dont need extra storage for UTXO set.
  - [ ] Of course we should have an api that doesn't care about any of this internal stuff, and just works and caches
        everything silently, with a size limit.
  - [ ] The goal is being able to store the entire blockchain as of September 2025 in less than ~200GB, while being able
        to validate everything from genesis to the tip. And indexing everything at the same time.
  - [ ] We should be able to support all lookups, all electrum endpoints, and we should be able to build something like
        mempool-space on top of this.
- [ ] Basic Block and TX validation
  - [ ] Check TX inputs are unspent
  - [ ] Check if TX inputs value >= outputs value (remaining is fee)
  - [ ] Check TX finality (nLockTime and nSequence)
  - [ ] Check Block header POW
  - [ ] Check Block timestamp
  - [ ] Check Block size limits
  - [ ] Check Block transactions are valid
  - [ ] Check Block transactions are not duplicated
  - [ ] Check Block Merkle root
  - [ ] Check Block weight (SegWit)
  - [ ] etc.
- [ ] OPCODES. We should be able to run a script interpreter and validate scripts.
- [ ] P2P handling, TX and Block propagation, basic anti-DoS, mempool management, etc.
- [ ] Basic first interfaces for querying the chain, mempool, and peers.
- [ ] and more to come...

## BIPs Implementation

- [ ] [BIP 9](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0009.mediawiki) – Informational – Version bits
      with timeout and delay
- [ ] [BIP 11](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0011.mediawiki) – Applications – M-of-N Standard
      Transactions
- [ ] [BIP 13](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0013.mediawiki) – Applications – Address Format
      for P2SH
- [ ] [BIP 14](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0014.mediawiki) – Peer Services – Protocol
      Version and User Agent
- [ ] [BIP 16](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0016.mediawiki) – Consensus (soft fork) – Pay to
      Script Hash
- [ ] [BIP 21](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0021.mediawiki) – Applications – URI Scheme
- [ ] [BIP 22](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0022.mediawiki) – API/RPC – getblocktemplate
      (Fundamentals)
- [ ] [BIP 23](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0023.mediawiki) – API/RPC – getblocktemplate
      (Pooled Mining)
- [ ] [BIP 30](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0030.mediawiki) – Consensus (soft fork) –
      Duplicate transactions
- [ ] [BIP 31](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0031.mediawiki) – Peer Services – Pong message
- [ ] [BIP 32](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0032.mediawiki) – Informational – HD Wallets
- [ ] [BIP 34](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0034.mediawiki) – Consensus (soft fork) – Block
      v2, Height in Coinbase
- [ ] [BIP 35](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0035.mediawiki) – Peer Services – mempool
      message
- [ ] [BIP 37](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0037.mediawiki) – Peer Services – Bloom
      filtering
- [ ] [BIP 39](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0039.mediawiki) – Applications – Mnemonic code
- [ ] [BIP 42](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0042.mediawiki) – Consensus (soft fork) – Finite
      monetary supply
- [ ] [BIP 43](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0043.mediawiki) – Applications – Purpose Field
      for HD Wallets
- [ ] [BIP 44](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0044.mediawiki) – Applications – Multi-Account
      HD Wallets
- [ ] [BIP 47](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0047.mediawiki) – Informational – Reusable
      Payment Codes
- [ ] [BIP 48](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0048.mediawiki) – Applications – Multi-Script
      Hierarchy for Multi-Sig Wallets
- [ ] [BIP 49](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0049.mediawiki) – Applications – P2WPKH-in-P2SH
      Derivation
- [ ] [BIP 50](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0050.mediawiki) – Informational – March 2013
      Chain Fork Post-Mortem
- [ ] [BIP 61](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0061.mediawiki) – Peer Services – Reject P2P
      message
- [ ] [BIP 65](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0065.mediawiki) – Consensus (soft fork) –
      OP_CHECKLOCKTIMEVERIFY
- [ ] [BIP 66](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0066.mediawiki) – Consensus (soft fork) – Strict
      DER signatures
- [ ] [BIP 68](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0068.mediawiki) – Consensus (soft fork) –
      Relative lock-time
- [ ] [BIP 70](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0070.mediawiki) – Applications – Payment
      Protocol
- [ ] [BIP 71](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0071.mediawiki) – Applications – Payment
      Protocol MIME types
- [ ] [BIP 72](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0072.mediawiki) – Applications – bitcoin: URI
      extensions
- [ ] [BIP 73](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0073.mediawiki) – Applications – Payment Request
      URLs
- [ ] [BIP 75](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0075.mediawiki) – Applications – Out of Band
      Address Exchange
- [ ] [BIP 84](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0084.mediawiki) – Applications – P2WPKH
      Derivation
- [ ] [BIP 85](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0085.mediawiki) – Informational – Deterministic
      Entropy from BIP32
- [ ] [BIP 86](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0086.mediawiki) – Applications – Key Derivation
      for P2TR Outputs
- [ ] [BIP 90](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0090.mediawiki) – Informational – Buried
      Deployments
- [ ] [BIP 91](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0091.mediawiki) – Consensus (soft fork) –
      Reduced threshold SegWit MASF
- [ ] [BIP 94](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0094.mediawiki) – Applications – Testnet 4
- [ ] [BIP 111](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0111.mediawiki) – Peer Services – NODE_BLOOM
      service bit
- [ ] [BIP 112](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0112.mediawiki) – Consensus (soft fork) –
      CHECKSEQUENCEVERIFY
- [ ] [BIP 113](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0113.mediawiki) – Consensus (soft fork) –
      Median time-past locktime
- [ ] [BIP 125](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0125.mediawiki) – Applications – Opt-in
      Replace-by-Fee
- [ ] [BIP 130](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0130.mediawiki) – Peer Services – sendheaders
- [ ] [BIP 133](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0133.mediawiki) – Peer Services – feefilter
- [ ] [BIP 137](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0137.mediawiki) – Applications – Message
      Signatures
- [ ] [BIP 141](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0141.mediawiki) – Consensus (soft fork) –
      Segregated Witness (Consensus)
- [ ] [BIP 143](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0143.mediawiki) – Consensus (soft fork) –
      Witness Sig Verification
- [ ] [BIP 144](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0144.mediawiki) – Peer Services – Segregated
      Witness
- [ ] [BIP 145](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0145.mediawiki) – API/RPC – getblocktemplate
      Updates for SegWit
- [ ] [BIP 147](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0147.mediawiki) – Consensus (soft fork) – Dummy
      stack element malleability
- [ ] [BIP 148](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0148.mediawiki) – Consensus (soft fork) –
      Mandatory SegWit activation
- [ ] [BIP 152](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0152.mediawiki) – Peer Services – Compact Block
      Relay
- [ ] [BIP 155](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0155.mediawiki) – Peer Services – addrv2
- [ ] [BIP 159](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0159.mediawiki) – Peer Services –
      NODE_NETWORK_LIMITED
- [ ] [BIP 173](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0173.mediawiki) – Informational – Bech32
      Address Format
- [ ] [BIP 174](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0174.mediawiki) – Applications – Partially
      Signed Bitcoin Transactions
- [ ] [BIP 324](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0324.mediawiki) – Peer Services – v2 P2P
      Transport
- [ ] [BIP 339](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0339.mediawiki) – Peer Services – WTXID-based
      Relay
- [ ] [BIP 340](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0340.mediawiki) – Standard – Schnorr Signatures
- [ ] [BIP 341](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0341.mediawiki) – Consensus (soft fork) –
      Taproot Spending Rules
- [ ] [BIP 342](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0342.mediawiki) – Consensus (soft fork) –
      Taproot Script Validation
- [ ] [BIP 343](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0343.mediawiki) – Consensus (soft fork) –
      Mandatory Taproot Activation
- [ ] [BIP 350](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0350.mediawiki) – Applications – Bech32m for
      v1+ Witness
- [ ] [BIP 370](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0370.mediawiki) – Applications – PSBT v2
- [ ] [BIP 371](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0371.mediawiki) – Applications – Taproot fields
      for PSBT
- [ ] [BIP 380](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0380.mediawiki) – Informational – Output Script
      Descriptors: General
- [ ] [BIP 381](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0381.mediawiki) – Informational – Non-SegWit
      Descriptors
- [ ] [BIP 382](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0382.mediawiki) – Informational – SegWit
      Descriptors
- [ ] [BIP 383](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0383.mediawiki) – Informational – Multisig
      Descriptors
- [ ] [BIP 384](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0384.mediawiki) – Informational – combo()
      Descriptors
- [ ] [BIP 385](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0385.mediawiki) – Informational – raw() and
      addr() Descriptors
- [ ] [BIP 386](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0386.mediawiki) – Informational – tr()
      Descriptors
- [ ] [BIP 387](https://github.com/DeepDoge/bitcoin-bips/blob/master/bip-0387.mediawiki) – Informational – Tapscript
      Multisig Descriptors
