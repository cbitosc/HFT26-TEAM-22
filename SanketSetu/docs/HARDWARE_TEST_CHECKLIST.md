# Hardware Test Checklist

Everything in this file is **UNVERIFIED** until a human physically runs it and ticks it — per
`CLAUDE.md` rule 4, nothing here may be claimed as working (in the README, the demo, or
anywhere else) until it's been checked off here with real devices. Code review and the unit
test suite (`npm test`, all run against `LoopbackTransport`/`SimTransport`, not real radios)
cannot substitute for this.

## Prerequisites

- [ ] Two (ideally three or four) Android phones, API 26+ (Android 8.0+), each with Bluetooth,
      BLE, and Wi-Fi hardware.
- [ ] Google Play Services installed and up to date on every phone.
- [ ] `app-debug.apk` built per the README's "Build & Run on Physical Android Devices" section
      and installed on every phone (`adb install -r app-debug.apk`, or Android Studio Run ▶ to
      each device in turn).
- [ ] Runtime permissions granted on first launch: Nearby devices / Bluetooth, Location
      (if offered), Notifications.

## 1. Basic two-phone pairing and messaging (airplane mode, BT+Wi-Fi on)

- [ ] Put both phones in Airplane Mode, then manually re-enable Bluetooth and Wi-Fi (confirms no
      cellular/data path is in use).
- [ ] Launch the app on both. Confirm each phone's top bar shows the other as a connected peer
      within ~30s (`peerFound` from `NearbyTransport` → `CompositeTransport` → `MeshEngine`).
- [ ] Send a direct message A → B. Confirm it arrives, decrypts, and the sender's delivery state
      reaches DELIVERED (not stuck at SENT/RELAYED).
- [ ] Open the Packet Inspector (Messages screen) and confirm the Ed25519 signature and
      X25519/XSalsa20-Poly1305 ciphertext fields are populated and `route` shows the real hop.
- [ ] Repeat B → A.

## 2. Screen-off / backgrounded relay (tests RelayCore + foreground service)

- [ ] With A and B connected, lock A's screen (or send the app to background) and leave it idle
      for at least 2 minutes.
- [ ] From a third phone C (out of direct range of A's final position, in range of B), send a
      message/SOS destined for A or broadcast.
- [ ] Confirm B still relays it toward A, and A still receives/delivers it despite being
      screen-off/backgrounded (this is specifically testing whether `RelayCore.kt`'s native
      relay + `MeshForegroundService` keep packets moving when the WebView may be throttled —
      do NOT consider this verified from emulator or screen-on testing).
- [ ] Note how long after wake A's UI reflects the message (should be near-immediate — the
      packet should already have arrived while backgrounded).

## 3. Multi-hop relay (3+ phones, A and C NOT in direct range)

- [ ] Physically position phones so A and C cannot reach each other directly (e.g. separate
      rooms/floors) but both can reach B.
- [ ] Send a message A → C. Confirm it arrives via B (check `route`/hop count in the inspector
      on C, should show B as an intermediate hop).
- [ ] Confirm B's own delivery/relay counters (Settings → Mesh Quality, if on B's own device)
      show a relayed packet.

## 4. SOS broadcast + closed-loop ACK across multiple phones

- [ ] From A, hold the SOS button for 3s with location opt-in set to "Coarse" — confirm the
      4-stage tracker shows Broadcast Sent.
- [ ] Confirm all other phones in range receive and display the SOS alert.
- [ ] On one phone, enroll as a Verified Responder (Settings or Responder Feed) and send an
      SOS_ACK. Confirm A's tracker advances to "Verified Responder ACK" / "Help En Route" and
      shows the ✔ VERIFIED badge (not "unverified").
- [ ] Repeat with location opt-in "Precise" — confirm only the enrolled responder's device shows
      the exact 5-decimal coordinates; a non-responder phone should only ever see the coarse
      (~1km) coordinates.

## 5. Permission denial handling

- [ ] Fresh install; deny Nearby/Bluetooth permission when prompted. Confirm the app shows a
      clear permission-denied state (not a silent failure or crash) and offers a way to retry /
      open system settings.
- [ ] Deny Location (if prompted) and confirm SOS composing still works with location disabled,
      without crashing.

## 6. Link break and store-and-forward recovery

- [ ] With A ↔ B ↔ C connected, physically move B out of range of both A and C (breaking the
      only path between them) mid-conversation.
- [ ] Send a message from A to C while disconnected — confirm it sits at PENDING/SENT in A's
      outbox rather than erroring.
- [ ] Move B back into range of both. Confirm the message is delivered via the SYNC_INV/SYNC_REQ
      anti-entropy exchange without the user resending anything.

## 7. Battery drain measurement (per power mode)

- [ ] Fully charge a phone, disable all other apps' background activity as much as possible.
- [ ] Run the app in **Active** power mode with 1+ connected peer for 1 hour; record battery %
      drop.
- [ ] Repeat for **Balanced** and **Saver** modes, same duration, same peer setup.
- [ ] Record all three numbers here once measured (replace the placeholders — do not estimate):
      - Active: ___% / hour (UNVERIFIED)
      - Balanced: ___% / hour (UNVERIFIED)
      - Saver: ___% / hour (UNVERIFIED)

## 8. Connection cap / fan-out rotation (5th peer)

- [ ] Get 5 phones advertising/discovering the same service in range of a single "hub" phone.
- [ ] Confirm the hub caps at `MAX_CONCURRENT_CONNECTIONS = 4` simultaneous connections and
      rotates out the oldest idle peer when a 5th tries to connect (check for a `fanOutLimit`
      event / log line, and that exactly one of the original 4 gets disconnected, not all of
      them).

## 9. Deterministic connection tie-break (no double-initiate)

- [ ] With verbose/debug logging enabled on both sides (Logcat, filter `SanketRelayCore` and
      `NearbyMeshPlugin`), bring two fresh phones into range simultaneously.
- [ ] Confirm the connection establishes cleanly without both sides simultaneously calling
      `requestConnection` in a way that causes a stuck/rejected pairing loop.

---

**Status:** every box above is UNVERIFIED as of this document's creation. The code has been
built and compiles (`./gradlew assembleDebug` succeeds — see README), and the mesh protocol
logic is unit-tested against simulated transports (`npm test`, 17/17 passing), but none of the
above has been run against real Android radios yet.
