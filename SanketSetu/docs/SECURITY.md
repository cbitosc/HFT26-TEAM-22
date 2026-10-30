# Security — Threat Model & Limits

Sanket Setu is a disaster-response tool, not a high-security messenger. This document states
plainly what it protects against, what it does not, and exactly where that line currently sits
in the code — so judges, responders, and future contributors aren't relying on claims the
implementation doesn't back.

## Cryptographic primitives (TweetNaCl only)

- **Packet authentication:** Ed25519 detached signatures (`nacl.sign.detached` /
  `nacl.sign.detached.verify`), `src/crypto/sign.ts`.
- **Direct message E2E encryption:** X25519 ECDH + XSalsa20-Poly1305 (`nacl.box`),
  `src/crypto/e2e.ts`. Intermediate relays never see plaintext.
- **Emergency broadcast channel (SOS):** XSalsa20-Poly1305 (`nacl.secretbox`) keyed by a
  SHA-512-derived 32-byte channel secret, `src/crypto/channel.ts`.
- **Responder-sealed precise GPS:** `nacl.box` from an ephemeral X25519 keypair to the
  Responder Group's public key, `src/crypto/sealedLocation.ts`.
- **Responder certificates:** Ed25519 signatures from a deterministic "DEMO AUTHORITY" keypair,
  `src/crypto/responderCert.ts`.

No XChaCha20, no custom primitives — if any doc, UI copy, or comment ever says otherwise,
that's a bug in the doc, not an intentional design choice.

## Signature scope (why `ttl`/`hops`/`route` are excluded)

`ttl` and `hops` mutate at every relay hop; `route` is an append-only diagnostic list of
relaying node IDs. None of the three are signed — the Ed25519 signature covers only the
immutable origin fields (`v, id, type, prio, src, srcSignPub, srcBoxPub, dst, ts, nonce,
payload`). A relay never re-signs another node's packet. **`route` is therefore an
unauthenticated hint, not proof of path** — a malicious relay could claim a false route without
invalidating the signature. The UI should (and currently does, via the packet inspector) present
`route` as informational, never as a verified claim.

## What this protects against

- Tampering with a packet's payload, sender, priority, timestamp, or destination in transit
  (signature verification rejects it, `tests/mesh.test.ts#1`).
- Forged signatures claiming to be another node (`#1`).
- Replay of an old packet more than ±5 minutes stale (`#13`).
- A peer flooding fake packet IDs to exhaust bandwidth: token-bucket rate limiting plus a
  3-strikes invalid-signature ban (`#8`).
- Forged or mismatched delivery/SOS acknowledgements — `DELIVERED` is only set on a signature
  verified against the actual intended recipient (`#14`).
- Casual eavesdropping on direct messages by intermediate relays (E2E encryption).
- Casual exposure of precise SOS coordinates to non-responders (sealed to the Responder Group
  key; non-responders only ever see coarse ~1km coordinates).

## What this does NOT protect against

1. **The bundled public emergency channel key only deters casual snooping.** SOS broadcasts use
   a shared, hardcoded default passphrase (`channel.ts`) so any nearby phone can display coarse
   alerts without prior key exchange — that's the whole point of a public emergency channel, but
   it means the ciphertext is trivially decryptable by anyone who reads the source. Confidential
   group use should configure a custom Safe-Circle channel key (QR-shared).
2. **A compromised responder device can unseal locations or impersonate.** Offline nodes can't
   query a revocation server mid-disaster, so a stolen/compromised phone holding a valid
   Responder Certificate and the Responder Group secret key can unseal precise SOS coordinates
   until keys are rotated out of band. There is no revocation mechanism yet.
3. **Metadata is visible to relays.** `src/dst/priority/size/timestamp` are all in the packet
   header in cleartext (by necessity — relays need them to route and schedule). Traffic analysis
   by anyone with radio access is possible; this system does not hide who is talking to whom,
   only the content of direct messages and precise GPS.
4. **No defense against state-level adversaries.** No protection against RF direction-finding,
   jamming, or an adversary with physical access to an unlocked device.
5. **The native relay (`RelayCore.kt`) forwards unverified packets.** It intentionally does zero
   signature checking — it only reads `id`/`ttl`/`hops` to dedup-and-forward, so the mesh keeps
   moving packets while the WebView is throttled (screen off/backgrounded). This means a
   malicious peer can make nearby devices spend radio/battery relaying fabricated packets; the
   only backstop at that layer is TTL expiry and a bounded dedup cache. The TypeScript
   `MeshEngine` is the sole authority that actually verifies anything, and it processes every
   payload independently of what RelayCore does.
6. **Key storage is device-local, not PIN-gated (current state, see below).**
7. **Key rotation is future work.** There is no mechanism to rotate the Responder Group keypair,
   the Demo Authority keypair, or an individual node's identity keypair without a full app reset
   (`clearAllLocalData`), which also discards all local message/alert history.

## Identity key storage: exactly what happens today

`src/crypto/identity.ts` + `src/store/useMeshStore.ts`:

- The Ed25519 and X25519 **secret** keys are never stored in plaintext. Public identity fields are
  stored as-is; the two secret keys are encrypted with `nacl.secretbox` under a 256-bit vault key.
- **With a PIN (chosen at first run or later):** the vault key is derived from the PIN and a random
  salt, exists only in memory for the session, and the random on-device key is deleted. Opening the
  app shows a PIN screen; without the PIN the secret keys cannot be decrypted. Forgetting the PIN
  means the keys are unrecoverable. The derivation is an iterated SHA-512 stretch (2048 rounds), which
  is **not** a vetted password KDF (scrypt/Argon2/PBKDF2) and is weak against offline guessing of a
  short PIN by someone who copies the storage.
- **Without a PIN (the user can skip, after a warning):** a random vault key is stored on the same
  device beside the ciphertext. That only protects against accidental exposure (exports, screenshots,
  casual inspection), **not** against anyone with read access to the app's storage.
- **Not implemented:** wrapping the vault key with the Android Keystore. `ensureHardwareKeyBacked()`
  creates a Keystore key but nothing uses it yet.
- Also stored in IndexedDB: this node's own sent messages, SOS alerts, and the unacknowledged outbox
  (restored after a restart). Message text for DMs is the plaintext the user typed; it is **not**
  encrypted at rest. The seen-cache stores packet ids only.

## Reporting

This is a hackathon project (Team Astra, HFT26-TEAM-22). There is no formal disclosure process;
open an issue or contact the team directly via the contacts in the root `README.md`.
