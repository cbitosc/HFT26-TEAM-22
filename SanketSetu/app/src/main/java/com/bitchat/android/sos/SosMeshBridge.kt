package com.bitchat.android.sos

/**
 * What [SosCoordinator] needs from the mesh. Implemented by `BluetoothMeshService`, which keeps the
 * BLE stack, packet signing and relaying exactly as they are — SOS traffic is ordinary signed
 * public MESSAGE broadcasts, just queued at a chosen priority.
 */
interface SosMeshBridge {
    val myPeerId: String

    fun myNickname(): String

    /** Devices currently connected (directly reachable). */
    fun connectedPeerCount(): Int

    /** This device's Ed25519 signing key — the key a responder certificate must be issued for. */
    fun mySigningPublicKey(): ByteArray?

    /** Ed25519 key of another peer as learned from its authenticated announce; null if unknown. */
    fun peerSigningKey(peerId: String): ByteArray?

    /** Display name of a known peer, or null. */
    fun peerNickname(peerId: String): String? = null

    fun verifyEd25519(signature: ByteArray, data: ByteArray, publicKey: ByteArray): Boolean

    /**
     * Signs [text] as a public MESSAGE and queues it at [priority] (0 = critical … 3 = low) with
     * initial [ttl]. When [syncable] the packet is also offered to gossip sync so devices that join
     * later still receive it; automatic receipts pass false so they do not use up sync capacity.
     */
    fun broadcast(text: String, priority: Int, ttl: Int, syncable: Boolean = true)
}
