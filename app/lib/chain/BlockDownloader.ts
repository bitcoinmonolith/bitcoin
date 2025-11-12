import { equals } from "@std/bytes";
import { Peer } from "~/lib/satoshi/p2p/Peer.ts";
import { PeerManager } from "~/lib/satoshi/p2p/PeerManager.ts";
import { BlockMessage } from "~/lib/satoshi/p2p/messages/Block.ts";
import { GetDataMessage } from "~/lib/satoshi/p2p/messages/GetData.ts";
import { Block } from "~/lib/satoshi/primitives/Block.ts";
import { humanize } from "../logging/human.ts";

/**
 * BlockDownloader handles downloading block bodies from peers.
 * It doesn't manage storage - just downloads and returns block data.
 */
export class BlockDownloader {
	private readonly peerManager: PeerManager;

	constructor(peerManager: PeerManager) {
		this.peerManager = peerManager;
	}

	/**
	 * Download a single block by hash.
	 * Tries multiple peers if one fails.
	 */
	public async downloadBlock(hash: Uint8Array): Promise<Block> {
		const maxAttempts = 5;
		let attempt = 0;
		const triedPeers = new Set<Peer>();

		while (attempt < maxAttempts) {
			attempt++;

			// Get a random peer that we haven't tried yet
			const peer = this.peerManager.randomPeer();
			if (!peer) {
				throw new Error(`No available peers to download block`);
			}

			triedPeers.add(peer);

			try {
				peer.log(`Requesting block ${humanize(hash)} (attempt ${attempt}/${maxAttempts})`);
				const blockPromise = peer.expect(BlockMessage, (payload) => equals(payload.header.hash, hash));
				await peer.send(GetDataMessage, { inventory: [{ type: "WITNESS_BLOCK", hash: hash }] });
				const block = await blockPromise;
				peer.log(`Successfully downloaded block`);
				return block;
			} catch (e) {
				peer.logError(`Failed to download block:`, e);
				// Try next peer
			}
		}

		throw new Error(`Failed to download block after ${maxAttempts} attempts`);
	}

	/**
	 * Download multiple blocks in a batch.
	 * Downloads them in parallel from different peers.
	 */
	public async downloadBatch(hashes: Iterable<Uint8Array>): Promise<Block[]> {
		const downloads: Promise<Block>[] = [];

		for (const hash of hashes) {
			downloads.push(this.downloadBlock(hash));
		}

		// Download all in parallel
		const results = await Promise.allSettled(downloads);

		// Collect successful downloads
		const downloadedBlocks: Block[] = [];
		for (const result of results) {
			if (result.status === "fulfilled") {
				downloadedBlocks.push(result.value);
			} else {
				console.error(`Failed to download block:`, result.reason);
			}
		}

		return downloadedBlocks;
	}
}
