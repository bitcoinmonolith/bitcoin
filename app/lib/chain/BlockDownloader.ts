import { sha256 } from "@noble/hashes/sha2";
import { equals } from "@std/bytes";
import { PeerManager } from "~/lib/satoshi/p2p/PeerManager.ts";
import { Peer } from "~/lib/satoshi/p2p/Peer.ts";
import { GetDataMessage } from "~/lib/satoshi/p2p/messages/GetData.ts";
import { BlockMessage } from "~/lib/satoshi/p2p/messages/Block.ts";
import { Block } from "~/lib/satoshi/primitives/Block.ts";
import { BlockHeader } from "../satoshi/primitives/BlockHeader.ts";

export type BlockDownloadResult = {
	hash: Uint8Array;
	data: Uint8Array;
};

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
	public async downloadBlock(hash: Uint8Array): Promise<BlockDownloadResult> {
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
				peer.log(
					`Requesting block ${hash.slice(0, 4).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "")}`,
				);

				const blockPromise = peer.expectRaw(BlockMessage, (payload) => {
					const headerBytes = payload.subarray(0, BlockHeader.stride);
					const receivedHash = sha256(sha256(headerBytes));
					return equals(receivedHash, hash);
				});

				// Request the block with witness data
				await peer.send(GetDataMessage, { inventory: [{ type: "WITNESS_BLOCK", hash: hash }] });

				const blockData = await blockPromise;

				// Decode to validate structure
				Block.decode(blockData);

				peer.log(`Successfully downloaded block`);

				return {
					hash: hash,
					data: blockData.slice(), // Copy the data
				};
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
	public async downloadBatch(hashes: Uint8Array[]): Promise<BlockDownloadResult[]> {
		const downloads: Promise<BlockDownloadResult>[] = [];

		for (const hash of hashes) {
			downloads.push(this.downloadBlock(hash));
		}

		// Download all in parallel
		const results = await Promise.allSettled(downloads);

		// Collect successful downloads
		const downloadedBlocks: BlockDownloadResult[] = [];
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
