# Sanket Setu — Operating Rules

Android-first, 100% offline, multi-hop emergency mesh messaging app with closed-loop SOS.
This file persists the rules the project is built under. Follow them on every change.

## Non-negotiables

1. **No server backend, ever.** "Backend" = the on-device mesh engine (`src/mesh/`,
   `src/crypto/`, `src/transport/`) + the Kotlin foreground service in
   `plugins/nearby-mesh/android/`. Core messaging, SOS, relay, ACK, sync, and crypto must
   NEVER touch the network. AI (Featherless.ai) is optional, disabled offline, advisory-only,
   and is the only code path allowed to make network calls.
2. **Verify after every task.** Run `npm run typecheck && npm test && npm run build` after
   every change. Do not move on to the next task while any of them are red.
3. **One logical change per commit**, conventional messages (`feat:`, `fix:`, `refactor:`,
   `test:`, `docs:`, `chore:`). Never rewrite or squash history. Never commit secrets,
   `node_modules`, `dist`, or keystores.
4. **No invented metrics, features, or hardware results.** Anything that only runs against
   `SimTransport` (the in-memory virtual mesh) must be visibly labeled SIMULATED in the UI.
   Anything that requires real phones to verify goes in `docs/HARDWARE_TEST_CHECKLIST.md`
   as UNVERIFIED until a human ticks it.
5. **No scope creep.** Don't add features outside an explicit task. Don't rewrite working
   code without a stated reason.
6. **Crypto is TweetNaCl only.** Ed25519 (`nacl.sign`) for signatures, X25519 + XSalsa20-Poly1305
   (`nacl.box` / `nacl.secretbox`) for encryption. Never claim XChaCha20 anywhere — fix any
   doc/UI/comment that says so.
7. **Signature scope is fixed and must not regress.** The Ed25519 signature
   (`src/crypto/sign.ts`) covers only immutable origin fields
   (`v, id, type, prio, src, srcSignPub, srcBoxPub, dst, ts, nonce, payload`). `ttl`, `hops`,
   and `route` mutate per hop and are intentionally excluded. Relays never re-sign another
   node's packet; `route` is an unauthenticated diagnostic hint only.
8. **`core/` layering**: `src/mesh/`, `src/crypto/`, `src/transport/`, and `src/db/` must
   never import from `src/screens/`, `src/components/`, `src/app/`, or `src/store/`.

## Repo layout note

The judged project root is `SanketSetu/` (this directory), inside the
`HFT26-TEAM-22` Hacktoberfest starter repo. `HFT26-TEAM-22/README.md` is the official
team-registration document for organizers and is intentionally left separate from this
project's own README/docs.

## Known architectural facts (keep docs honest about these)

- `MeshEngine` (`src/mesh/engine.ts`) is transport-agnostic and already implements
  Ed25519 auth, X25519 E2E, channel-encrypted SOS, sealed precise location, controlled
  flooding, 4-queue priority scheduling, jitter + overhear suppression, replay window,
  per-peer rate limiting, store-and-forward outbox with exponential backoff, and
  SYNC_INV/SYNC_REQ anti-entropy. This logic is real and unit-tested (`tests/mesh.test.ts`).
- There is no `android/` Capacitor platform directory yet — `npx cap add android` has not
  been run, so the Kotlin plugin in `plugins/nearby-mesh/` cannot currently be compiled into
  an APK.
- `NearbyTransport` (real Google Nearby Connections) is not wired into the live
  `MeshEngine` — the app's single engine instance always runs on `SimTransport`.
  Fixing this wiring (and making the native plugin buildable) is the highest-priority
  remaining gap for the judged "offline P2P messaging" requirement.
