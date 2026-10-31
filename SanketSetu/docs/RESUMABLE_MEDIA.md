# Resumable offline media transfer

Photos, voice notes and short clips move across the mesh in content-addressed chunks that survive a dropped
link. A transfer cut at 50% continues from 50%.

The wire formats follow the `ping` project's protocol spec (`protocol/SPEC.md`). The code here is written from
that spec, not copied: `ping` is AGPL-3.0, this project is GPL-3.0. If you want to share code verbatim, check
the licence with its owners first.

## Packet types

| Type | Value | Where | Payload |
|------|-------|-------|---------|
| `MEDIA_OFFER` | `0x40` | signed broadcast (public) or inside the Noise session (private) | `blobHash(32) · totalSize(u32) · mimeTag(u8) · chunkSize(u16) · thumbnail(≤16 KiB)`; private adds `key(32)` |
| `MEDIA_REQUEST` | `0x41` | addressed to the offerer | `blobHash(32) · chunkCount(u16) · bitmap(⌈n/8⌉)`, optional Wi-Fi endpoint `0x4C · ipv4(4) · port(u16) · token(8)` |
| `MEDIA_CHUNK` | `0x42` | addressed to the requester | `blobHash(32) · index(u32) · data` |

The spec numbers these 0x10–0x12. In this codebase 0x10 and 0x11 are `NOISE_HANDSHAKE` and
`NOISE_ENCRYPTED`, which the iOS-compatible BLE protocol already uses, so the media types live at
0x40–0x42. Stock BitChat nodes ignore them. Bitmap bit *i* is byte *i/8*, bit *i mod 8* (LSB first). Private
offers use `NoisePayloadType.MEDIA_OFFER` (0x30).

## Flow

1. **Offer.** The sender stores the file in the `BlobStore`, hashes it, and announces it with a small thumbnail.
2. **Request.** A receiver that does not already hold the hash sends one request with every bit set.
3. **Chunks.** The sender queues the requested chunks and a pump sends a few at a time at the lowest packet
   priority, so text and SOS are never starved.
4. **Resume.** If no chunk arrives for 8 s (`RESUME_TIMEOUT_MS`), or the neighbour reconnects, the receiver
   re-requests only the missing bits. The sender replaces its queue with that request. The partial file and its
   bitmap are on disk, so an app restart resumes too.
5. **Verify.** When every bit is set, the file is accepted only if `sha256(file) == blobHash`; otherwise it is
   discarded whole.

Chunks are 384 bytes on Bluetooth, which keeps a whole packet under the 512-byte fragmentation threshold so one
lost radio fragment costs one chunk, not several. Files above 1 MiB use 2048-byte chunks and need the Wi-Fi lane.

## Lanes

- **Bluetooth** carries everything, up to 1 MiB per blob.
- **Wi-Fi / hotspot** is opened on demand for blobs above 64 KiB. The receiver listens on its Wi-Fi address and
  advertises `ip:port:token` in its request over Bluetooth; the sender dials in and streams the chunks. If the
  phones share no network, or the socket fails, the transfer simply continues over Bluetooth.

## Privacy

- **Public** blobs are plaintext and deduplicated by hash. Anyone in range can read them, like a public message.
- **Private** blobs are sealed with a random 256-bit key and AES-GCM per chunk. The key is sent only inside the
  Noise session, so relays see ciphertext and cannot forge chunks. Only the intended recipient may pull the blob.
- Chunks and requests are unsigned (the hash or the AEAD tag authenticates them). Offers are signed.

## Limits and known gaps

- Files up to 24 KiB, and generic documents, still use the legacy one-shot `FILE_TRANSFER`, which stock
  BitChat phones understand. Larger photos, voice notes and videos need SanketSetu on both ends.
- Offers are not part of gossip sync, so a phone that was out of range when a public offer went out will not
  see it. Private offers are retried every 30 s for 10 minutes.
- Wi-Fi networks that isolate clients block the socket lane; Bluetooth takes over.
- Tested with the JVM engine tests and Robolectric coordinator tests (including real sockets). **Not yet run
  between two physical phones.**

## Files

`:resqmesh-ai` `media/`: `MediaCodecs`, `BlobStore`, `IncomingTransfer`, `MediaCipher`, `MediaTransferEngine`,
`LanLane`. `:app`: `features/media/MediaTransferCoordinator`, `ui/media/MediaTransferStrip`,
`ui/MediaSendingManager` (routing), `mesh/BluetoothMeshService` (packet glue).
