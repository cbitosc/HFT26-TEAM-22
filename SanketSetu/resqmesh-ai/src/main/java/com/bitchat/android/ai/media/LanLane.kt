package com.bitchat.android.ai.media

import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap

/**
 * The bulk lane: an on-demand TCP socket between two phones on the same Wi-Fi or hotspot (no internet
 * needed). Bluetooth keeps carrying offers, requests and anything small; this lane only exists while a
 * large blob is moving, so it never fights the 2.4 GHz mesh for airtime.
 */
interface LanLane {
    /** Receiver: start (or reuse) a listener for [hashHex] and return the endpoint to advertise, or null with no usable network. */
    fun listen(hashHex: String, onChunk: (MediaChunk) -> Unit): LanEndpoint?

    fun stopListening(hashHex: String)

    /** Sender: blocking push of [chunks] to [endpoint]. Throws on any failure so the caller can fall back to Bluetooth. */
    fun stream(endpoint: LanEndpoint, blobHash: ByteArray, chunks: Iterator<MediaChunk>)
}

fun interface LanEnvironment {
    /** IPv4 of the Wi-Fi / hotspot interface, or null when the phone is on no local network. */
    fun localIpv4(): ByteArray?
}

class TcpLanLane(
    private val env: LanEnvironment,
    private val random: SecureRandom = SecureRandom()
) : LanLane {

    private class Listener(val server: ServerSocket, val token: ByteArray, val endpoint: LanEndpoint)

    private val listeners = ConcurrentHashMap<String, Listener>()

    @Synchronized
    override fun listen(hashHex: String, onChunk: (MediaChunk) -> Unit): LanEndpoint? {
        listeners[hashHex]?.let { return it.endpoint }
        val ip = env.localIpv4() ?: return null
        val server = try {
            ServerSocket().apply {
                reuseAddress = true
                bind(InetSocketAddress(InetAddress.getByAddress(ip), 0), 4)
            }
        } catch (_: Exception) {
            return null
        }
        val token = ByteArray(8).also { random.nextBytes(it) }
        val endpoint = LanEndpoint(ip, server.localPort, token)
        val listener = Listener(server, token, endpoint)
        listeners[hashHex] = listener
        val expectedHash = hashHex.hexToBytes()
        daemon("lan-accept-$hashHex") {
            while (!server.isClosed) {
                val socket = try { server.accept() } catch (_: Exception) { break }
                daemon("lan-in") { serve(socket, token, expectedHash, onChunk) }
            }
        }
        return endpoint
    }

    @Synchronized
    override fun stopListening(hashHex: String) {
        listeners.remove(hashHex)?.let { try { it.server.close() } catch (_: Exception) { } }
    }

    override fun stream(endpoint: LanEndpoint, blobHash: ByteArray, chunks: Iterator<MediaChunk>) {
        Socket().use { socket ->
            socket.tcpNoDelay = true
            socket.connect(InetSocketAddress(InetAddress.getByAddress(endpoint.ipv4), endpoint.port), CONNECT_TIMEOUT_MS)
            socket.soTimeout = IO_TIMEOUT_MS
            val out = DataOutputStream(socket.getOutputStream().buffered(64 * 1024))
            out.write(MAGIC)
            out.write(endpoint.token)
            out.write(blobHash)
            while (chunks.hasNext()) {
                val frame = MediaCodecs.encodeChunk(chunks.next())
                out.writeInt(frame.size)
                out.write(frame)
            }
            out.flush()
            socket.shutdownOutput()
            // Wait for the receiver to close so a late reset cannot truncate the tail of the stream.
            try { socket.getInputStream().read() } catch (_: Exception) { }
        }
    }

    private fun serve(socket: Socket, token: ByteArray, expectedHash: ByteArray, onChunk: (MediaChunk) -> Unit) {
        socket.use { s ->
            try {
                s.soTimeout = IO_TIMEOUT_MS
                val input = DataInputStream(s.getInputStream().buffered(64 * 1024))
                val magic = ByteArray(MAGIC.size).also { input.readFully(it) }
                val presented = ByteArray(8).also { input.readFully(it) }
                val hash = ByteArray(32).also { input.readFully(it) }
                if (!MessageDigest.isEqual(magic, MAGIC) || !MessageDigest.isEqual(presented, token) ||
                    !MessageDigest.isEqual(hash, expectedHash)
                ) return
                while (true) {
                    val len = try { input.readInt() } catch (_: java.io.EOFException) { break }
                    if (len < 36 || len > MAX_FRAME) return
                    val frame = ByteArray(len).also { input.readFully(it) }
                    val chunk = try { MediaCodecs.decodeChunk(frame) } catch (_: MediaCodecException) { return }
                    if (!MessageDigest.isEqual(chunk.blobHash, expectedHash)) return
                    onChunk(chunk)
                }
            } catch (_: Exception) {
            }
        }
    }

    private fun daemon(name: String, body: () -> Unit) {
        Thread(body, name).apply { isDaemon = true }.start()
    }

    companion object {
        private val MAGIC = byteArrayOf('S'.code.toByte(), 'S'.code.toByte(), 'L'.code.toByte(), '1'.code.toByte())
        private const val MAX_FRAME = 8 * 1024
        private const val CONNECT_TIMEOUT_MS = 3_000
        private const val IO_TIMEOUT_MS = 10_000
    }
}
