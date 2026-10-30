# Sanket Setu — Offline Emergency Mesh Messaging System

**Team:** Astra  
**Problem Statement:** Offline Emergency Messaging System (Cybersecurity · Communication Networks · Disaster Management · AI/ML)  
**Tagline:** *"Stay connected when everything goes dark."*

> **Product Thesis:** *Other apps send messages when the network dies. Sanket Setu makes sure help actually arrives: encrypted, acknowledged by verified responders, and bridged back online when any phone finds signal.*

---

## 1. Problem Statement

When floods, earthquakes, cyclones, or infrastructure blackouts sever cellular towers and fiber backhaul, survivors and field responders lose the ability to coordinate within the first critical hours:

1. **Zero-Bar Dead Zones:** Standard messaging apps fail immediately without DNS, cloud servers, or cellular carriers.
2. **Open-Loop Panic:** Even basic Bluetooth broadcast tools leave survivors guessing whether anyone received their SOS or if a qualified rescue team is actually coming.
3. **Unauthenticated Spoofing & Coordinate Exposure:** Broadcasting raw GPS coordinates in plaintext exposes vulnerable survivors to opportunists and allows malicious nodes to inject forged "rescue en route" messages.

**Sanket Setu** turns Android smartphones into a self-forming, cryptographically authenticated multi-hop mesh network that works **100% offline** in Airplane Mode, closes the loop between survivor and verified responder, and bridges SOS alerts back online (`Setu`) the moment any single node regains connectivity.

---

## 2. System Architecture Diagram

```text
+-----------------------------------------------------------------------------------+
|                        UI LAYER (React 19 + TypeScript + NOVA UI)                 |
|  Home · E2E Messages · Closed-Loop SOS · Responder Feed · Circles · Map · Sim     |
|  Packet / Route / Crypto Inspector · Mesh Quality Telemetry · Optional Online AI  |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                      ZUSTAND STATE & DEXIE PERSISTENCE LAYER                      |
|  useMeshStore.ts  <--->  Dexie IndexedDB (messages, alerts, outbox, peers, seen)  |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                     CORE MESH ENGINE (src/mesh/engine.ts)                         |
|  1. 4-Queue Priority Scheduler: P0(SOS) -> P1(Emergency) -> P2(Normal) -> P3(ACK) |
|  2. Controlled Flooding: TTL 8 (Normal) / 12 (SOS), no echo back to sender        |
|  3. Jitter & Suppression: 10–50ms (0–10ms SOS) delay; cancel if >=2 overhears     |
|  4. Replay & Rate Defense: ±5 min timestamp window, 1h SeenCache, token bucket    |
|  5. Store-and-Forward Outbox: 1s -> 30s exp backoff + SYNC_INV / SYNC_REQ sync    |
|  6. Crypto (TweetNaCl): Ed25519 sigs + X25519/XSalsa20-Poly1305 E2E & Sealed GPS  |
+-------------------+-------------------------------------------+-------------------+
                    |
                    v
+-----------------------------------------------------------------------------------+
|              CompositeTransport.ts (fans the engine out to every radio)           |
|  Browser (no native bridge): SimTransport only (4-node demo chain)                |
|  Native Android: NearbyTransport + SimTransport together — real nearby phones     |
|  AND the seeded demo peers both show up as peers on the same running engine       |
+---------------------------------------+   +---------------------------------------+
|       SimTransport.ts (VIRTUAL)       |   |     NearbyTransport.ts (CAPACITOR)    |
|  4-Node Chain (A <-> B <-> C <-> D)   |   |  Enforces MAX_CONCURRENT = 4 peers    |
|  Link break, range, latency, loss     |   |  Idle peer rotation + fan-out logging |
+---------------------------------------+   +-------------------+-------------------+
                                                                |
                                                                v
                                            +---------------------------------------+
                                            |   ANDROID NATIVE LAYER (Kotlin SDK)   |
                                            |  NearbyMeshPlugin.kt (P2P_CLUSTER)    |
                                            |  BLE + Bluetooth Classic + Wi-Fi Dir  |
                                            |  Deterministic connect tie-break +    |
                                            |  version-tagged endpoints             |
                                            |  RelayCore.kt: header-only relay      |
                                            |  (dedup + TTL decrement only, NOT     |
                                            |  signature-verified) so forwarding    |
                                            |  continues while the WebView is       |
                                            |  throttled (screen off/backgrounded)  |
                                            |  MeshForegroundService.kt (WakeLock)  |
                                            +---------------------------------------+
```

---

## 3. Wire Packet Format & Signature Scope

Every packet transmitted over `SimTransport` or `NearbyTransport` is a compact JSON envelope (`≤ 4096 B`) defined in `src/mesh/types.ts`:

```json
{
  "v": 1,
  "id": "c7a9f2d0-8e4b-4c1a-9f32-1b5e8d7a6c04",
  "type": "SOS",
  "prio": 0,
  "ttl": 12,
  "hops": 2,
  "src": "8F3A19C04B2E7D11",
  "srcSignPub": "<Base64 Ed25519 Public Key (32B)>",
  "srcBoxPub": "<Base64 X25519 Public Key (32B)>",
  "dst": "BROADCAST",
  "ts": 1742041200000,
  "nonce": "<Base64 24-byte random nonce>",
  "payload": "<Base64 XSalsa20-Poly1305 Ciphertext + 16B Poly1305 MAC>",
  "route": ["8F3A19C04B2E7D11", "4C91E02A7B5D3F88", "9D20B41F6E8A1C55"],
  "sig": "<Base64 64-byte Ed25519 Detached Signature>"
}
```

### Immutable Signature Scope (`src/crypto/sign.ts`)
Because `ttl`, `hops`, and `route` mutate at each intermediate relay hop, the **Ed25519 signature (`sig`) covers strictly the immutable origin fields** in canonical order:
`v`, `id`, `type`, `prio`, `src`, `srcSignPub`, `srcBoxPub`, `dst`, `ts`, `nonce`, `payload`.

- **Zero Re-Signing by Relays:** Intermediate nodes decrement `ttl`, increment `hops`, and append their `nodeId` to `route` without touching `sig`.
- **Tamper Rejection:** Any modification to `payload`, `src`, `prio`, `ts`, or `sig` at any hop causes `verifyPacketSignature(packet)` to fail immediately, dropping the packet and incrementing the peer's invalid-signature penalty counter.

---

## 4. Priority Scheduler, Controlled Flooding, Jitter & Retry Parameters

All protocol parameters are centralized in `src/mesh/constants.ts` (`MESH_CONSTANTS`):

| Parameter | Constant | Value | Behavior |
| :--- | :--- | :--- | :--- |
| **Priority Queues** | `P0..P3` | `4 queues` | `P0` = SOS / SOS_ACK, `P1` = Emergency / Safe / Hazard, `P2` = Normal Direct Chat, `P3` = Info / ACK / Sync. Strictly dequeued `P0 → P1 → P2 → P3`. Under congestion or battery saver (`<15%`), drops `P3` then `P2`; **never drops `P0` or `P1`**. |
| **Default TTL** | `TTL_NORMAL` / `TTL_SOS` | `8` / `12` | Decremented at every relay hop; packet dropped when `nextTtl <= 0` (`ttl_expired`). Never echoed back to `fromPeerId` or `packet.src`. |
| **Relay Jitter** | `JITTER_NORMAL` / `JITTER_SOS` | `10–50 ms` / `0–10 ms` | Random forward delay per hop to prevent radio collisions. |
| **Overhear Suppression** | `OVERHEAR_SUPPRESSION_THRESHOLD` | `2 neighbors` | If the same packet ID is heard from `≥ 2` distinct neighbors while waiting in the jitter timer (`pendingRelayTimers`), `clearTimeout` cancels the scheduled forward immediately. |
| **Seen-Cache Expiry** | `SEEN_CACHE_TTL_MS` | `3,600,000 ms` (1h) | Deduplicates seen packet IDs for 1 hour; persisted in Dexie (`sanketDb.seen`). |
| **Replay Window** | `REPLAY_WINDOW_MS` | `±300,000 ms` (±5m) | Packets with `|now - packet.ts| > 5 min` are dropped and logged as `replay_window`. |
| **Outbox Retry Backoff** | `RETRY_BASE_MS` .. `RETRY_CAP_MS` | `1 s → 30 s` cap | Exponential backoff (`1s, 2s, 4s, 8s, 16s, 30s`) plus immediate retry on `peerFound` and anti-entropy `SYNC_INV` / `SYNC_REQ` reconciliation. Unacknowledged `P0` SOS beacons never expire during an active incident. |
| **Delivery States** | `DeliveryState` | `PENDING → SENT → RELAYED(n) → DELIVERED` | `DELIVERED` is set **only** when a valid Ed25519-signed `ACK` (`ackKind: "DELIVERED"`) from the intended `recipientId` (or `SOS_ACK` for SOS) is verified. |

---

## 5. Cryptographic Architecture, Threat Model & Limits

### Cryptographic Primitives (`TweetNaCl` — `XSalsa20-Poly1305` & `Ed25519`)
All cryptography runs 100% offline in TypeScript (`src/crypto/`) using audited **TweetNaCl**:
- **Packet Authentication:** `Ed25519` (`nacl.sign.detached` / `nacl.sign.detached.verify`).
- **Direct Message E2E Encryption (`MSG`):** `X25519` ECDH key agreement + `XSalsa20-Poly1305` authenticated encryption (`nacl.box` / `nacl.box.open`). Intermediate relay nodes cannot read message plaintext.
- **Emergency Broadcast Channel (`SOS`):** `XSalsa20-Poly1305` (`nacl.secretbox`) keyed with the SHA-512-derived 32-byte Emergency Channel / Circle key.
- **Responder-Sealed Precise GPS (`src/crypto/sealedLocation.ts`):** When a survivor sends an SOS with precise location enabled, exact GPS coordinates (`lat, lng, accuracy, altitude`) are sealed via `nacl.box` (`X25519-XSalsa20-Poly1305`) to the **Responder Group X25519 public key**, while only coarse (`~1 km`) coordinates appear in the general broadcast cleartext.
- **Verified Responder Certificates (`src/crypto/responderCert.ts`):** Offline `Ed25519` certificates signed by the `DEMO AUTHORITY` root key bind a responder's `nodeId`, `signPub`, `role` (`NDRF_MEDIC`, `FIRE_RESCUE`, `CIVIL_DEFENSE`, `POLICE`), and expiry timestamp.
- **Key Storage at Rest (`src/crypto/identity.ts`):** The Ed25519/X25519 secret keys are never stored in plaintext. They are split from the public identity fields and persisted encrypted (`nacl.secretbox`) under a random 256-bit per-install local vault key (`db/dexie.ts: getOrCreateLocalVaultKey`). This protects against accidental plaintext exposure (exports, screenshots, casual DB inspection) but — like any key stored alongside its own ciphertext on the same device — does **not** protect against an attacker with full local filesystem/IndexedDB access; there is no PIN-unlock screen gating app launch yet, so the optional onboarding PIN currently only encrypts a separate, not-yet-wired-up portable backup blob. `NearbyMeshPlugin.ensureHardwareKeyBacked()` provisions an `AES-256-GCM` key in the hardware-backed `AndroidKeyStore`, but it is not yet used to wrap the identity vault — wiring that up is the natural next hardening step. See `docs/SECURITY.md` for the full threat model.

### Threat Model & Limits
1. **Bundled Emergency Channel Key:** The default public emergency channel key (`SANKET-SETU-DEFAULT-EMERGENCY-CHANNEL-KEY-V1`) is shared across all nodes so any nearby civilian phone can display coarse SOS alerts. It **only stops casual passive snooping** by non-protocol listeners. For confidential group broadcasts, users can configure a custom secret key or scan a Family Circle QR code.
2. **Compromised Responder Device Exposure:** Because offline nodes cannot query an online CRL/OCSP server during a blackout, a physically compromised responder phone holding the Responder Group secret key can unseal precise SOS coordinates until the Responder Group keypair and Authority certificates are rotated.
3. **No Defense Against State-Level Adversaries:** Sanket Setu defends against packet tampering, replay attacks (`±5 min`), unauthorized responder impersonation, and casual eavesdropping in disaster zones. It does **not** defend against state-level RF direction finding, traffic-analysis metadata correlation, or physical side-channel extraction of an unlocked device.

---

## 6. Known Limitations

1. **Concurrent Connection Cap (`3–5` Peers per Device):** Google Nearby Connections (`Strategy.P2P_CLUSTER` over Bluetooth + BLE + Wi-Fi Direct) reliably sustains `3–5` simultaneous bidirectional socket connections per Android handset. `NearbyMeshPlugin.kt` and `NearbyTransport.ts` explicitly enforce `MAX_CONCURRENT_CONNECTIONS = 4`, automatically rotating out the oldest idle neighbor when a 5th peer connects and logging a `fanOutLimit` event. Multi-hop store-and-forward and `SYNC_INV` epidemic sync bridge larger clusters across time.
2. **Soft Real-Time Store-and-Forward:** Because packets experience per-hop jitter (`10–50 ms`), radio switching overhead, and intermittent neighbor disconnects, Sanket Setu is a **soft real-time delay-tolerant mesh**, not a synchronous voice/video link.
3. **Battery vs. Connectivity Trade-Off:** Continuous `P2P_CLUSTER` scanning (`Active` 100% duty cycle) consumes more battery than `Balanced` (`10s scan / 20s sleep`, 33% duty) or `Emergency Saver` (`5s scan / 45s sleep`, 10% duty, relays only `P0/P1`). At `≤ 5%` battery, Sanket Setu emits a final **Last-Gasp SOS** and enters `Emergency Saver`.
4. **Android + Google Play Services Requirement:** Native physical-radio mesh transport requires Android 8.0+ (API 26+, Android 12+ nearby permissions) with Google Play Services (`play-services-nearby:19.3.0`). Browser mode uses the deterministic in-memory `SimTransport` virtual mesh. iOS is out of scope (Nearby Connections is Android/Play-Services-only).
5. **Native relay forwards unverified packets:** `RelayCore.kt`'s header-only relay (see architecture diagram) does not check Ed25519 signatures — it only reads `id`/`ttl`/`hops` to dedup and forward. It exists so the mesh keeps relaying other nodes' traffic while the WebView is throttled; the TypeScript `MeshEngine` remains the sole authority for signature verification, decryption, and all UI/delivery state, which it performs independently on every payload regardless of what RelayCore does. The practical consequence: a malicious peer can burn nearby devices' radio/battery with fabricated packets without a valid signature, bounded only by TTL and the dedup cache, not by any trust check at that layer. Full threat model in `docs/SECURITY.md`.
6. **Identity vault is device-local, not PIN-gated:** see "Key Storage at Rest" above — the running app currently auto-unlocks via a local vault key rather than requiring the onboarding PIN on each launch. There is no PIN-unlock screen shown on app launch.
7. **Signature verification runs on the main thread, not a Web Worker:** `verifyPacketSignature` (`src/crypto/sign.ts`) is called synchronously inside `MeshEngine.handleRawBytes` on every incoming packet. Only PIN-identity decryption currently uses a Web Worker (`src/crypto/crypto.worker.ts` via `cryptoWorkerClient.ts`). Under a packet flood this could cause UI jank; offloading signature verification (and ideally batch-verification) to a worker is a known remaining piece of work, not yet done.

---

## 7. Setup, Build & Test Instructions

### Run Unit & Integration Tests (`node:test` via `tsx`)
```bash
npm install
npm test
```
Runs the automated test suite in `tests/mesh.test.ts` verifying:
- Ed25519 signature verification & tampered payload rejection
- X25519 + XSalsa20-Poly1305 E2E direct encryption & wrong-recipient rejection
- Seen-cache deduplication & overhear suppression (`≥ 2` neighbors)
- Active jitter timer cancellation (`clearTimeout`) when `≥ 2` neighbor copies arrive during the wait window
- TTL decrement (`8` normal, `12` SOS) and `TTL=0` drop logging
- Replay window (`±5 min`) rejection and structured drop logging
- Forged `ACK` / `SOS_ACK` rejection (`DELIVERED` requires authentic recipient signature)
- 4-queue priority scheduler (`P0 → P1 → P2 → P3`) under congestion load
- 4-node multi-hop relay (`A → B → C → D`), mid-flight link break (`B ↔ C`), store-and-forward queuing, and `SYNC_INV` / `SYNC_REQ` recovery
- Verified Responder Certificates & Responder-Sealed Precise GPS location privacy

### Run in Browser (Interactive 4-Node Virtual Mesh Simulator)
```bash
npm run dev
```
Opens on `http://localhost:3000`. Works 100% offline after load.

### Build & Run on Physical Android Devices (Capacitor 8)

The `android/` Capacitor platform is committed to this repo (`npx cap add android` has
already been run), with the native mesh plugin (`plugins/nearby-mesh/android/`) wired in
as a Gradle library module the app depends on — you do not need to recreate either.

**JDK requirement:** `@capacitor/android` 8.6's own Gradle module targets Java 21 bytecode,
so building needs a **JDK 21** on `JAVA_HOME` (not whatever `java -version` on your PATH
happens to be — JDK 11/17 fail with "invalid source release: 21", and JDK 25/26 fail
Gradle itself with "Unsupported class file major version"). If you don't already have one:
```bash
brew install openjdk@21
```

**Option A — Android Studio (recommended for first-time setup/testing):**
1. Open Android Studio → **Open** → select the `SanketSetu/android` folder (not `SanketSetu/`
   itself — that's the web project root, `android/` is the native platform).
2. If prompted to upgrade the Gradle wrapper, **decline** — this project is pinned to
   Gradle 8.14.3 + AGP 8.13.0, which is what's been verified to build.
3. Settings → Build, Execution, Deployment → Build Tools → Gradle → **Gradle JDK**: pick a
   JDK 21 (e.g. the `openjdk@21` installed above, or "Download JDK..." → 21 → Eclipse Temurin).
4. Let Gradle sync, then Run ▶ on a connected device or emulator (minSdk 26 / Android 8.0+).

**Option B — command line:**
```bash
npm install
npm run build              # builds dist/ from the web app
npx cap sync android       # copies dist/ + plugin config into android/
cd android
JAVA_HOME="$(brew --prefix openjdk@21)" ANDROID_HOME="$HOME/Library/Android/sdk" \
  ./gradlew assembleDebug  # -> android/app/build/outputs/apk/debug/app-debug.apk
# install on a connected/USB-debugging device:
JAVA_HOME="$(brew --prefix openjdk@21)" ANDROID_HOME="$HOME/Library/Android/sdk" \
  ./gradlew installDebug
```

After editing any TypeScript/React source, re-run `npm run build && npx cap sync android`
before rebuilding the APK — the native project only ever sees what's in `dist/`, it doesn't
watch `src/`.

**Testing real mesh behavior needs two physical Android phones** (an emulator can't exercise
Bluetooth/Wi-Fi Direct radios against a second device) with Bluetooth and Wi-Fi left on. See
`docs/HARDWARE_TEST_CHECKLIST.md` for the exact test matrix — everything on it is marked
UNVERIFIED until a human runs it on real hardware.

---

## 8. 3-Minute Judge Demo Script

1. **0:00 – 0:40 | Offline Proof & Closed-Loop SOS (`HOME` / `SOS & TRACKER`):**
   - Toggle Airplane Mode / Offline. Hold the coral SOS ring for 3 seconds (or tap a multilingual Hindi/Telugu/Tamil Quick-SOS pictogram).
   - Show the **4-Step Closed-Loop SOS Tracker** (`1. Broadcast Sent → 2. Relayed by N Peers → 3. Verified Responder ACK → 4. Help En Route`).
2. **0:40 – 1:30 | Verified Responder Certs & Sealed Precise GPS (`RESPONDER FEED`):**
   - Open `RESPONDER FEED`. Point out that unverified civilian nodes only see coarse (`~1 km`) coordinates (`SEALED TO RESPONDER KEY`).
   - Click **"Enroll as Verified NDRF Medic (DEMO AUTHORITY)"** — watch the sealed `X25519-XSalsa20-Poly1305` GPS payload unlock exact coordinates (`±8m`) and emit a cryptographically verified `SOS_ACK`.
3. **1:30 – 2:25 | 4-Node Multi-Hop, Link Break & Congestion Benchmark (`SIMULATOR`):**
   - Open `SIMULATOR`. Click **"1. Send E2E Message A → D (3 Hops)"** and inspect the hop path (`A → B → C → D`), Ed25519 signature, and `XSalsa20-Poly1305` ciphertext in the Packet Inspector.
   - Click **"2. Break Middle Link (B↔C)"**, send another message (`PENDING / SENT` in Outbox), then click **"2. Restore Middle Link (B↔C) & Sync"** to watch `SYNC_INV` deliver it automatically (`DELIVERED`).
   - Run **"4. Congestion Benchmark (P0 SOS vs P2/P3)"** to compare simulated SOS latency with normal traffic. The panel labels estimates as `SIMULATED`; this aggregate result does not provide p50/p95 distributions.
4. **2:25 – 3:00 | Safety Circles, Hazard Map & Optional Online AI (`SAFE & HAZARDS` / `AI TRIAGE`):**
   - Send a 1-tap **"I'm Safe"** family circle check-in and view signed hazard reports on the `MESH MAP`.
   - Open `AI TRIAGE` to show that when offline, the rule-based keyword classifier runs locally while Featherless.ai is cleanly disabled; when online, AI triage outputs carry the `"AI suggestion, use your judgment."` disclaimer.

---

## 9. Screenshots

Capture screenshots in the default light theme. For browser captures, run `npm run dev`, open
`http://localhost:3000`, and set the browser viewport to **360 × 800** (also check 412 × 915).
For Android, install the debug APK, set the app to light mode in **More → Settings**, open the
screen to capture, then run:

```bash
mkdir -p docs/screenshots
adb exec-out screencap -p > docs/screenshots/home-light.png
```

Repeat for `sos-tracker-light.png`, `packet-inspector-light.png`,
`simulator-light.png`, and `map-light.png`, opening each screen before capture. Keep the
`SIMULATED` or `REAL RADIO` indicator visible in captures that show mesh status. Add approved
images to this section with Markdown image links; no device screenshots are checked in yet.

See [UI performance notes](docs/UI_PERFORMANCE.md) for current production chunk sizes and what
has not been measured on a real phone.

## 10. Attribution & Disclosure

- All mesh engine, cryptography (`Ed25519` / `X25519` / `XSalsa20-Poly1305`), responder certificate authority, sealed location, store-and-forward outbox, anti-entropy sync, virtual multi-node simulator, and Android Capacitor `NearbyMeshPlugin` code was written for **Sanket Setu** by Team Astra.
- The visual design uses a light-first safety interface with bundled Noto Sans fonts. The optional 3D mesh visual is off by default and can be enabled in Settings.
