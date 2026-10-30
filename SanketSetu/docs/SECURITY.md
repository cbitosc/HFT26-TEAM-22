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

## Identity key storage — exactly what happens today

`src/crypto/identity.ts` + `src/store/useMeshStore.ts`:

- A node's Ed25519 and X25519 **secret** keys are never written to storage in plaintext. They
  are split from the public identity fields (node ID, display name, public keys — safe to store
  plaintext) and encrypted with `nacl.secretbox` under a random 256-bit **local vault key**
  (`db/dexie.ts: getOrCreateLocalVaultKey`), generated once per install and stored alongside the
  ciphertext in the same IndexedDB.
- **What this protects against:** accidental plaintext exposure — a DB export, a screenshot of
  dev tools, a support screen-share, a casual `grep` through exported data.
- **What this does NOT protect against:** an attacker with full read access to the device's
  local storage (the key lives right next to what it encrypts). Real protection against that
  threat requires either (a) wrapping the vault key with the Android Keystore hardware-backed
  AES key that `NearbyMeshPlugin.ensureHardwareKeyBacked()` already provisions but does not yet
  use for this purpose, or (b) a PIN-gated unlock screen shown on every app launch that derives
  the vault key from a PIN the user enters (not yet built — onboarding collects an optional PIN
  and encrypts a separate portable backup blob with it, but nothing currently reads that blob
  back to unlock the running app).
- This is a known, scoped limitation, not an oversight — it is accurately reflected in the UI
  copy and this document rather than claimed as "PIN-protected" or "hardware-backed" when it
  isn't yet wired up end to end.

## Reporting

This is a hackathon project (Team Astra, HFT26-TEAM-22). There is no formal disclosure process;
open an issue or contact the team directly via the contacts in the root `README.md`.
