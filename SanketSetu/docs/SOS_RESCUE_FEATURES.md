# SOS rescue features (ported from Sanket Setu)

Hold-to-send SOS, zero-typing multilingual situations, a closed-loop status tracker, verified
responders and location tiers — added on top of the existing BitChat BLE mesh without changing its
packet format, relay logic or the `:resqmesh-ai` classifiers.

## Where things live

| Module | Path | What |
|---|---|---|
| `:resqmesh-ai` (pure Kotlin, no Android) | `ai/sos/` | `SosProtocol` wire codec, `SosCategory`, `SosLanguage`, `SosText`, `SosLocation`/`LocationTier`, `SosTrackerState`, `ResponderCertificate` + `ResponderVerifier` |
| `:app` | `sos/` | `SosCoordinator` (state, send, replies, responder identity), `SosMeshBridge`, `TrustAnchors`, `SosPreferences`, `SosLocationSource` |
| `:app` | `ui/sos/` | `EmergencySosTabScreen` (the SOS HUB tab), `SosHoldButton`, `SosMessageCard`, `ResponderDialog`, `SosPalette`, `SosHaptics` |
| `:app` debug only | `src/debug/.../sos/DemoAuthority.kt` | development certificate authority (release has an inert stub) |

Touched existing code (all additive): `BluetoothMeshService` (new `sendPriorityBroadcast` + bridge),
`MessageHandler.handleBroadcastMessage` (offers plain text to the SOS layer first),
`ChatScreen` (SOS HUB is one of its five tabs), `MessageItem` (renders SOS cards).

## Wire format

SOS traffic is an ordinary signed public `MESSAGE` broadcast. The text is a short English body
(readable on a stock BitChat node) plus one tag line:

```
[[SOS1;id=a1b2c3d4;c=MED;l=C;g=12.97,77.59]]
[[ACK1;id=a1b2c3d4;to=<originPeerId>;k=R|A|E;t=7;cs=<callsign>;n=<note>;cert=<base64url>]]
```

Why not a new packet type: the 13-byte header is iOS-compatible and has no priority field, and
unknown types risk being dropped by other BitChat nodes. A text tag keeps signing, relaying,
fragmentation, dedup and gossip sync working unchanged. **Trade-off:** a stock BitChat node (not
ResQMesh) shows the raw tag line, and shows receipts as chat lines (`✓ SOS received`).

Priority 0 is the existing `RoutedPacket.priority` (CRITICAL, front of the broadcast queue). SOS and
human replies go out at TTL 7; automatic receipts at TTL `hops+2` clamped to 4..7 and priority 1, not
offered to gossip sync.

## The four stages (what each one actually means)

1. **Broadcasted** — the packet was queued; shows how many *directly connected* devices existed at
   that moment (0 is shown honestly, with a note that it will spread when one connects).
2. **Reached N nodes** — N distinct other devices that sent *any* reply (automatic receipt or
   human). A lower bound: receipts can be lost, so N can under-count.
3. **Acknowledged** — at least one person replied Acknowledge or On my way (verified or not).
4. **Responder en route** — a *verified* responder replied On my way. A civilian saying so shows up in
   the responder list as "Unverified Civilian Relay" but does **not** complete this stage.

Hop count per responder = `ttl the replier used − ttl received` (each relay subtracts one).

## Trust model for "verified"

Every mesh packet is already signed with the sender's Ed25519 key, so a civilian cannot impersonate
another phone. A responder certificate then binds a role to that same key:

`RQC1 | role | authorityKeyId | expiry | callsign | subjectKey(32) | authoritySignature(64)`

A reply counts as verified only if: the certificate decodes; its authority key id is in
`TrustAnchors`; the authority signature is valid; it has not expired; **and** `subjectKey` equals the
key that signed the packet carrying the reply. A certificate copied from a real responder is useless
on any other phone. All six rejection reasons are unit-tested with real Ed25519.

**`TrustAnchors.provisioned` is empty on purpose.** This repository contains no real NDRF / Civil
Defense signing key and one must not be invented. Until a real authority public key is added there,
a release build verifies nobody. Debug builds additionally trust `DemoAuthority` (its private seed is
public in the repo), and anything it certifies is labelled **DEMO AUTHORITY**.

## Location tiers

No GPS (nothing leaves the phone) / Coarse (rounded to 2 decimals ≈ 1.1 km north–south; east–west
distance shrinks with latitude) / Precise (5 decimals). Rounding happens before encoding, so a coarse
SOS never carries the precise fix. Default tier is Coarse. Fix source: a fresh high-accuracy fix
(4 s timeout), else a cached fix no older than 10 minutes, else none (sent without coordinates and
the sender is told).

## Deliberate design decisions

- The bare hold-to-send button transmits only a situation selected in the current session, otherwise
  generic "Emergency — need help". It never remembers the last emergency type across sessions: a stale
  "fire" sent during a flood is worse than a generic call. The bar shows what it will send.
- Automatic receipts are only sent for *fresh* distress calls (≤ 10 min old), once per SOS id, with
  0.4–2.5 s random delay. Gossip sync replays history to newly joined phones; answering all of it
  would flood the mesh.
- The SOS layer sits behind a `try/catch` in `MessageHandler`: any failure falls back to treating the
  text as ordinary chat.

## Known limitations (read before relying on this)

- **Nothing here has been run on a phone or emulator.** No device was available when this was built.
  Everything below the "Verified by tests" line is UNVERIFIED on hardware.
- Hindi, Telugu and Tamil strings were drafted without a native-speaker review. Have fluent speakers
  check `SosCategory` and `SosText` before field use.
- "Reached N" can be inflated by one attacker creating many identities (BitChat identities are cheap).
  Only the final, certificate-protected stage resists that.
- The tracker lives in memory; killing the app loses it (the SOS itself is already on the mesh and in
  gossip sync).
- The SOS is broadcast once (plus gossip sync for late joiners); there is no periodic re-broadcast.
- Below TTL 4 the existing relay policy relays probabilistically, so far hops are not guaranteed.
- No Android notification / alarm is added for an incoming SOS — it uses the app's existing
  new-message haptic. A rescuer with the app in the background may not notice it.
- Automatic receipts add mesh traffic proportional to the number of devices in range of an SOS.
- Hold-to-send is a touch gesture; the TalkBack "send now" action deliberately bypasses the 3-second
  hold, so it must be chosen explicitly from the accessibility actions menu.

## Verified by tests (JVM / Robolectric, no radio)

- `:resqmesh-ai` — 42 tests: wire round trips for every category × tier, tag-injection and malformed
  input, location rounding and locale independence, completeness of all four languages, tracker
  stages including forged "help is coming", certificate verification with real Ed25519
  (valid, tampered, expired, wrong authority, copied-to-another-key, garbage).
- `:app` — 22 tests driving the real `SosCoordinator` through a fake mesh bridge (priority 0 / TTL 7,
  receipts, hop count, civilian never completes the loop, replayed certificate rejected, ordinary chat
  passes through untouched and triggers nothing) and `SosPaletteContrastTest` (WCAG ratios).
- Full suites at time of writing: `:resqmesh-ai` 197 tests, `:app` 93 tests (12 pre-existing
  `@Ignore`), 0 failures; `./gradlew assembleDebug --no-daemon --max-workers=2` succeeds and produces
  `app/build/outputs/apk/debug/app-universal-debug.apk`.

## Two-phone test checklist — UNVERIFIED until a human ticks each box

Debug APK on two phones (A = victim, B = responder), Bluetooth and location on, internet off.

- [ ] A and B appear in each other's peer list.
- [ ] Ordinary chat both ways still works (regression check).
- [ ] A holds the SOS button < 3 s → vibrates, ring resets, nothing is sent; B sees nothing.
- [ ] A holds 3 s → buzz; B shows an SOS card in its chat within a few seconds.
- [ ] A's tracker reaches **Reached 1 nodes** without anyone touching B.
- [ ] B taps Acknowledge → A reaches **Acknowledged**, shows `Unverified Civilian Relay`, hop count 0.
- [ ] B taps I'm on my way (no certificate) → A stays at **Acknowledged** (stage 4 not complete).
- [ ] B: Responder mode → Issue demo certificate (debug) → I'm on my way → A reaches **Responder en
      route** with `✔ VERIFIED RESPONDENT` and `DEMO AUTHORITY`.
- [ ] Language switch HI / TE / TA re-renders the grid and tracker without restart; scripts render.
- [ ] Location: Coarse shows 2-decimal coordinates; Precise shows 5; No GPS shows none; indoors with
      no fix shows "sent without location".
- [ ] A third phone C one hop away from A (out of A's range): C relays; A shows B/C hops > 0.
- [ ] Release build: no certificate verifies as VERIFIED (no demo authority present).
