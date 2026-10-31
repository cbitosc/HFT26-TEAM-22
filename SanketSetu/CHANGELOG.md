# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),


# Changelog — ResQMesh AI

## [Unreleased]

### Added
- Resumable offline media transfer (`:resqmesh-ai` `media/`, `:app` `features/media/MediaTransferCoordinator`): photos, voice notes and short clips above 24 KiB are addressed by SHA-256 (`blobHash`) and moved by a 3-way handshake (`MEDIA_OFFER` with a thumbnail of at most 16 KiB, `MEDIA_REQUEST` carrying a chunk bitmap, `MEDIA_CHUNK`). If Bluetooth drops, the receiver re-requests only the missing bits after 8 s (or at once when the neighbour reconnects) so a transfer cut at 50% continues from 50%, never from chunk 0; the bitmap is persisted so an app restart resumes too. A blob is accepted only if its full SHA-256 matches the offer. See `docs/RESUMABLE_MEDIA.md`.
- Private media is sealed end to end: the chunk key travels only inside the Noise session (`NoisePayloadType.MEDIA_OFFER`) and each chunk is AES-256-GCM, so relays carry ciphertext and forged chunks are rejected on arrival.
- Dual-lane transport: Bluetooth always carries offers, requests and small files; for files above 64 KiB the receiver can open an on-demand Wi-Fi/hotspot socket (`TcpLanLane`, one-time token) so chunks stream without jamming the Bluetooth channel. Falls back to Bluetooth automatically if the socket fails.
- Content-addressed `BlobStore` (streaming, 96 MB cap with oldest-first eviction) so a peer never downloads a blob it already holds; `MediaTransferStrip` shows incoming transfers with their thumbnail, progress and lane above the message box.
- Mesh map (Mesh tab, new Radar/Map switch; `MeshMapScreen`, `TopologyLayout` in `:resqmesh-ai`): offline picture of the multi-hop mesh built from announcement gossip, with you in the middle, one ring per relay hop, solid/dashed links for confirmed/one-sided reports, devices with no known route on an outer ring, and tap-to-trace route with relay names and a Chat button.
- Tests: 35 media engine tests (resume at 50%, repeated loss, corrupt chunk, restart resume, private sealing, real-socket Wi-Fi lane and its Bluetooth fallback), 6 coordinator tests, 11 topology tests, 6 photo-caption tests.

- 3-second press-and-hold Emergency SOS button (`SosHoldButton`) as the hero of the dedicated SOS HUB tab (`EmergencySosTabScreen`): circular progress ring, escalating vibration pulses (`SosHaptics`), releasing early aborts and sends nothing; completing the hold broadcasts a priority-0 packet at full TTL. Exposes an explicit "send now" TalkBack action for users who cannot sustain a hold
- Zero-typing situation picker (`EmergencySosTabScreen`, `SosCategory` in `:resqmesh-ai`): Medical/Trauma, Trapped/Collapse, Rising Flood, Fire/Smoke, Supplies, I'm Safe; labels and screen text switch instantly between English, Hindi, Telugu and Tamil (`SosLanguage`, `SosText`). The wire carries a language-independent category code, so every reader sees the situation in their own language
- Location sharing tiers chosen before sending (`LocationTier`, `SosLocation`): No GPS, Coarse (~1 km, coordinates rounded to 2 decimals before encoding) and Precise (5 decimals). If a tier is chosen but no GPS fix exists the SOS is sent without coordinates and the sender is told
- Closed-loop SOS tracker: after sending, the SOS screen becomes a 4-stage vertical pipeline — Broadcasted, Reached N nodes, Acknowledged, Responder en route — driven only by real replies (`SosTrackerState`). Devices that receive a fresh SOS send an automatic receipt (`AckKind.RECEIVED`); people can reply Acknowledge / I'm on my way. Each responder shows callsign, hop count and note
- Verified responder vs civilian distinction (`ResponderCertificate`, `ResponderVerifier`, `TrustAnchors`, `ResponderDialog`): an authority-signed Ed25519 certificate bound to the responder's own signing key; replies show `✔ VERIFIED RESPONDENT` or `Unverified Civilian Relay`. Only a verified responder saying "on my way" completes the final stage
- `DemoAuthority` (debug source set only; inert stub in release): development certificate authority so the verified path can be exercised on test phones; certificates are labelled `DEMO AUTHORITY`. `TrustAnchors.provisioned` is intentionally empty — no real NDRF/Civil Defense key exists in this repo
- Five-section navigation (`MainModeTabBar` in `ChatScreen`): CHAT, SOS HUB, ALERTS, RADAR, AI TRIAGE, each its own screen (`EmergencySosTabScreen`, `AlertsFeedTabScreen`, `MeshRadarTabScreen`, `AiTriageTabScreen`). The SOS tab shows the live acknowledgement count while a beacon is active
- SanketSetu launcher icon (adaptive, themed/monochrome, round) and status-bar notification icon drawn from the logo's own geometry (`ic_launcher_foreground.xml`, `ic_launcher_monochrome.xml`, `ic_launcher_background.xml`, `ic_notification.xml`), replacing the stock "BIT" tile; brand palette in `brand_colors.xml`; Android 12+ system splash background set to the brand paper colour
- Animated load screen (`InitializingScreen`, `SanketSetuLogo` in `ui/brand/`): the logo builds itself once (horizon, home node, three signal arcs, reflection, coral beacon) then the wordmark fades in; only the status dots keep moving afterwards. Honours the system "remove animations" setting. `tagline_offline` string
- SanketSetu design system (`ui/brand/SanketTokens.kt`, `SanketUi.kt`): role-based colour tokens for light and dark (`Sanket.colors`), shared `SanketCard`, `StatusPill`, `ScreenHeader`, `SanketButton`, `EmptyState`. Each accent has a fill and a darker ink twin so text stays AA on both backgrounds. `Theme.kt` now derives the Material colour scheme from the tokens, so every existing screen picks up the brand
- `SanketTabBar` replaces the sideways-scrolling dark tab strip: five fixed equal slots (Chat, SOS, Alerts, Radar, AI) so all sections are always visible, one clear selected pill, count badges instead of changing label text, and accessibility roles/descriptions
- Radar: proximity disc in the logo's ring language (closer to centre = stronger signal, with an on-screen note that direction is not measured), signal bars, and a stateless `MeshRadarContent` so it can be rendered without a view-model
- AI triage: capability rows read from the installed models (`TFLiteMessageClassifier.isModelAvailable`, `VisionTFLiteClassifier.isAvailable`, `VoskManager.isModelAvailable`) instead of a hard-coded "ACTIVE"; first-aid protocols restyled with a "does not replace trained responders" note
- `SanketTokensContrastTest`: WCAG contrast for every text/background pair in use, for both palettes. `AlertsOrderTest` pins the triage order. `UiSnapshotTest` (opt-in, `SNAPSHOTS=1`) renders every section in light and dark to `app/build/ui-snapshots/` via Robolectric native graphics for design review
- `SosProtocol.humanReadable()` and `sosDisplayText()`: SOS beacons read as plain language in the alert feed and ICS-213 report; localized "1 hop away", offline tagline and nearby-count strings
- Incoming-SOS alert (`SosAlertNotifier`): a fresh SOS from someone nearby buzzes the phone (three-pulse vibration) and posts a high-priority heads-up notification (sound, lock-screen visible, situation in the reader's language, sender and location), even with the app closed; once per SOS, not for "I'm safe", stale history or your own SOS. Covered by `SosCoordinatorTest`
- `SosMessageCard`: received SOS and "I'm safe" broadcasts render as an emergency card with one-tap replies instead of a text line
- `SosCoordinator`, `SosMeshBridge`, `SosPreferences`, `SosLocationSource` (`:app`, `sos/`) — SOS state, sending, reply handling, responder identity
- `SosProtocol`, `SosTrackerState`, `SosText` and friends (`:resqmesh-ai`, `ai/sos/`) — pure-Kotlin wire codec, tracker state machine, certificate codec and localized content
- Tests: 42 JVM tests in `:resqmesh-ai` (wire format round trips and injection, location tiers, localization completeness, tracker stages, real-Ed25519 certificate verification incl. tamper/expiry/copied-certificate cases); 22 Robolectric tests in `:app` driving the real `SosCoordinator` through a fake mesh; `SosPaletteContrastTest` computing WCAG ratios for every text/background pair used
- `docs/SOS_RESCUE_FEATURES.md` — design, wire format, trust model, limitations and the two-phone test checklist

### Changed
- Photos, voice notes and clips over 24 KiB are sent through the resumable engine instead of one-shot `FILE_TRANSFER` (smaller files and generic documents keep the legacy path, which stock BitChat phones understand).
- Typography: core text styles and ~180 explicit uses moved from monospace to the system sans family (debug tools and the ICS-213 form view stay monospace). The Material theme no longer sets text to terminal green
- Chat: messages are rounded cards with the sender name in colour and the text in normal ink (previously the whole message was tinted with the sender's colour, orange for yourself); `<@name>` wrapper replaced by `name:`; timestamps are `[HH:mm]` (the proof-of-work animation regex accepts both formats); input is a rounded field with brand-coloured buttons and 44-48 dp touch targets (were 32 dp); slash-command and mention highlighting take theme colours
- SOS tab: header with live nearby-devices pill, equal-height situation tiles, proper radio controls, token-based palette (`SosPalette` now follows light/dark)
- App renamed ResQMesh AI -> SanketSetu: `app_name`/`app_brand` and all user-facing strings in the 27 locale folders that define them, ICS-213 report footer, About sheet, README, CLAUDE.md heading and the Gradle root project name (`sanketsetu-android`). Gradle module ids (`:resqmesh-ai`), Kotlin packages (`com.bitchat.android`) and the application id are intentionally unchanged
- `BluetoothMeshService` — added `sendPriorityBroadcast(content, priority, ttl, syncable)` (same packet type, signing and gossip bookkeeping as `sendMessage`, but with an explicit queue priority) and a `SosMeshBridge` adapter attached in `init`. `sendMessage` and all packet/relay code are unchanged
- `MessageHandler.handleBroadcastMessage` — plain-text broadcasts are first offered to `SosCoordinator`; SOS replies/receipts are consumed instead of shown as chat lines, everything else follows the original path unchanged. An exception in the SOS layer falls back to treating the text as ordinary chat
- `MessageItem` renders SOS broadcasts as `SosMessageCard`

### Fixed
- Photo reports no longer get unrelated captions: emergency labels need confidence of 0.6 and are matched as whole words ("member" no longer matches EMBER, "fireplace" no longer matches FIRE), the vision model needs 0.75 before its guess is used, and a photo nothing can place now says "Photo attached. Add a short note" instead of an invented description.
- Alerts feed listed newest first, so CRITICAL alerts could sit below routine ones; it now orders critical, then high, then normal (newest first within each)
- Alerts feed and ICS-213 report showed the raw `[[SOS1;...]]` machine tag for received SOS beacons; they now show the situation in plain language
- Radar showed "Moderate (-70 dBm)" for peers with no signal reading (the value was defaulted); it now says "Signal unknown"
- Alert category filter chips wrapped letter by letter ("FI/RE") and left a large blank gap; chips now wrap as pills in a flow layout
- Own chat messages used orange (about 2.2:1 on the light background, below WCAG AA); now brand blue ink
- Removed the never-triggered SOS overlay path in `ChatScreen` (`showSosScreen` was never set to true and wrote state during composition) and the unused `SosHomeBar`/`SosScreen`; the SOS hint under the hold button is now localized instead of hard-coded English


## [0.0.4] - 2026-04-22

### Added
- `VisionTFLiteClassifier` (`:resqmesh-ai`, `ai/vision/`) — on-device TFLite image classifier for emergency scene detection (fire, flood, normal, security, weather); loads `emergency_vision_model.tflite` and `vision_label_map.json` from assets; accepts Bitmap input, resizes to 224×224, normalizes pixels to [-1, 1], and runs inference; returns `SceneAnalysisResult` compatible with the existing vision pipeline; includes `isAvailable(context)` check for graceful degradation
- `emergency_vision_model.tflite` (2.68 MB MobileNetV2) and `vision_label_map.json` assets in `:resqmesh-ai` module
- `PriorityQueueBenchmarkTest` (M5 benchmark suite) in `:resqmesh-ai` — JUnit coverage measuring CRITICAL-packet latency under queue load
- `LatencyBenchmark` utility in `:resqmesh-ai` for classifier/relay performance measurement

### Changed
- `ImageSceneAnalyzer` now uses a hybrid approach: tries `VisionTFLiteClassifier` first (confidence ≥ 0.55); falls back to ML Kit Image Labeling when TFLite is unavailable or not confident enough
- Added `noCompress += "tflite"` to `:resqmesh-ai` build config to prevent asset compression
- Retrained `emergency_model.tflite` — grew from 430 KB to 1.16 MB with updated vocabulary; `label_map.json` and `tokenizer.json` refreshed accordingly for improved accuracy across the 10 emergency categories
- `KeywordMessageClassifier` — additional phrases and edge-case handling refinements
- `ICS213ReportGenerator` output formatting refinements (header, signature blocks, row layout)
- `ICS213ReportScreen` layout cleanup — improved spacing, header rendering, and signature-block presentation
- `ChatScreen`, `EmergencyFeedSheet`, `InputComponents` — miscellaneous UI polish for message input, emergency feed presentation, and category badges
- `README.md` substantially rewritten (161 insertions / 90 deletions) to document the photo-to-category pipeline, retrained text classifier, and current feature set
- `CLAUDE.md` expanded with image-to-category pipeline documentation, vision module layout, and model asset inventory

### Fixed
- `LocationAttachSheet` — corrected dialog lifecycle so `onSkip` and swipe-dismiss correctly suppress the outgoing message; `onSend` reliably appends `📍 lat,lon` to the message body
- `ChatScreen` — location-dialog wiring updated to match the corrected `LocationAttachSheet` callbacks

## [0.0.3] - 2026-04-06

### Added
- `SceneToEmergencyMapper` (`:resqmesh-ai`, `ai/vision/`) — pure-Kotlin mapper that converts ML Kit image label strings to the app's 9 emergency categories (MEDICAL, FIRE, FLOOD, COLLAPSE, SECURITY, WEATHER, INFRASTRUCTURE, RESOURCE_REQUEST, MISSING_PERSON); produces a pre-formatted TextField description with emoji and actionable suffix (e.g. `"🔥 FIRE: Fire, smoke, burning. Requires immediate response."`)
- `ImageSceneAnalyzer` (`:app`, `features/media/`) — suspending wrapper around ML Kit Image Labeling (bundled model, works fully offline); reuses `ImageUtils.loadBitmapWithExifOrientation`; delegates label→category mapping to `SceneToEmergencyMapper`
- `PhotoReportButton` (`:app`, `ui/media/`) — new orange `AddAPhoto` icon button in the chat input row; single-click opens gallery, long-click opens camera (same gesture as the replaced `ImagePickerButton`); shows `CircularProgressIndicator` while ML Kit runs (~300 ms); three outcome paths: emergency category detected → `onSceneAnalyzed`, generic labels detected → `onSceneAnalyzed` with `"📷 Scene: …"` description, ML Kit hard failure → `onImageReady` fallback (plain image send)
- `pendingPhotoPath` state in `ChatScreen` and `MeshPeerListSheet` — stores the captured image path until the user validates the generated description and taps Send; photo and text message are dispatched together on confirmation

### Changed
- `ImagePickerButton` usage in `InputComponents.kt` commented out and replaced by `PhotoReportButton`; original code preserved for future reference
- `MessageInput`, `ChatInputSection` signatures — new `onSceneAnalyzed: (description, imagePath) -> Unit` parameter added; all call sites updated (`ChatScreen`, `MeshPeerListSheet`)
- `onSend` handler in `ChatScreen` and `MeshPeerListSheet` — flushes `pendingPhotoPath` via `sendImageNote` before dispatching the text message when a photo-report is in progress

## [0.0.2] - 2026-04-03

### Changed
- Retrained TFLite emergency classifier model (`emergency_model.tflite`) with updated vocabulary and softmax output layer — model now outputs probabilities directly, removing the need for manual softmax post-processing
- Added 10th output class `NONE` to `label_map.json` and `MessagePriority` enum (renamed from `LOW`) for non-emergency messages
- `ClassifierUtils.mapToPriority()` now maps unknown/unrecognised categories to `NONE` instead of `NORMAL`
- `TFLiteMessageClassifier` no longer applies `softmax()` to model output (model includes softmax in its final layer)

### Added
- 90 vocabulary coverage tests in `TFLiteMessageClassifierTest` — 10 example messages per emergency category, verifying the tokenizer recognises enough domain-specific words

### Fixed
- Removed leftover debug log in `TFLiteMessageClassifier.loadWordIndex()`

## [0.0.1] - 2026-03-09

### Added
- `:resqmesh-ai` Gradle library module — all AI/ML code extracted from `:app`, independently testable
- `KeywordMessageClassifier` — ~90 FEMA/ICS keyword rules across 9 emergency categories (MEDICAL, FIRE, FLOOD, COLLAPSE, SECURITY, WEATHER, MISSING_PERSON, INFRASTRUCTURE, RESOURCE_REQUEST)
- `TFLiteMessageClassifier` — on-device neural classifier; auto-activates when `message_classifier.tflite` asset is present
- `CompositeMessageClassifier` — keyword-first pipeline with TFLite fallback; keyword results bypass confidence threshold for CRITICAL/HIGH priority
- Coloured left stripe and emoji badge on every classified message (e.g. `🏥 MEDICAL · 94%`); all colours derived from `MaterialTheme.colorScheme` for light/dark theme support
- `EmergencyFeedSheet` — categories sorted by priority with coloured stripes, message counts, and a close button
- `CategoryMessagesScreen` — full-screen slide-in view filtered to one emergency category; system back button supported via `BackHandler`
- Offline speech-to-text (`VoskTranscribeButton`) integrated into the chat input bar
- Emergency Feed 🚨 button moved to the header, right of the peer counter; shows live emergency message count (`👥 2  🚨 3`) for ambient situational awareness
- Tap any message in `CategoryMessagesScreen` to dismiss the overlay and jump to that message in the main chat
- `ICS213ReportData` + `ICS213ReportGenerator` — FEMA ICS-213 General Message form rendered as self-contained HTML; pure Kotlin, no Android deps, unit-testable in `:resqmesh-ai`
- `ICS213PrintHelper` — loads report into a headless `WebView` and triggers Android `PrintManager` (Save as PDF / physical printer)
- `ICS213ReportScreen` — full-screen Compose preview with black/green header and Share button; white background for print legibility
- "GENERATE ICS-213 REPORT" button pinned at the bottom of `EmergencyFeedSheet`; hidden when the Feed is empty
- `EmergencyClassification.kt` (`:resqmesh-ai`) — canonical `shouldShowEmergencyBadge()` and `shouldShowPossibleBadge()` predicates; `categoryEmojiAndLabel()` extracted from `:app` into the AI module
- `LocationAttachSheet` — optional GPS / manual address attachment for CRITICAL and HIGH messages; appended as `📍 lat,lon` to message body; location never pre-filled
- **BLE Priority Queue** — `BluetoothPacketBroadcaster` actor replaced with `java.util.PriorityQueue` + `Mutex` + `CONFLATED` signal; CRITICAL packets preempt all queued NORMAL/LOW packets at the radio layer
- `RoutedPacket.priority: Int` field (default 2 = NORMAL); `sendMessage()` classifies content with `KeywordMessageClassifier` synchronously and sets priority before enqueuing
- `PriorityQueueBenchmarkTest` — 5 JUnit tests proving CRITICAL latency improvement; benchmark output: 1001× faster delivery vs FIFO with 1 000 queued packets at 100 µs/packet
- **AI Energy Management (Feature 6 — first iteration)** — relay probability now adapts to the device's battery state without Wi-Fi Direct or protocol changes:
  - `EnergyMode` enum in `:resqmesh-ai` (PERFORMANCE / BALANCED / POWER_SAVER / ULTRA_LOW_POWER) mirrors `PowerManager.PowerMode` without creating a cross-module Android dependency
  - `EnergyRelayPolicy` (`:resqmesh-ai`) — pure Kotlin policy engine combining `networkFactor(networkSize)` × `energyMultiplier(EnergyMode)` for normal packets; separate `criticalRelayProbability()` for high-TTL SOS/MAYDAY packets that always relay (0.20 at ULTRA_LOW_POWER as last-resort forwarder)
  - `PacketRelayManager.energyMode` — new field; `shouldRelayPacket()` now delegates entirely to `EnergyRelayPolicy`; debug info includes current energy mode and both relay probabilities
  - `PacketProcessor.energyMode` — delegating property forwarding to `PacketRelayManager`
  - `BluetoothConnectionManager.onEnergyModeChanged` — nullable callback invoked on every `PowerManager` mode change; maps `PowerMode → EnergyMode` via private extension without coupling `:resqmesh-ai` to Android types
  - `BluetoothMeshService.setupDelegates()` — wires the callback: `connectionManager.onEnergyModeChanged = { mode -> packetProcessor.energyMode = mode }`
  - `EnergyRelayPolicyTest` — 21 JUnit tests covering all boundary values, all enum combinations, passive-mode invariant (ULTRA_LOW_POWER → 0.0 normal / 0.2 critical), and monotonicity of both axes
  - `BluetoothConnectionManager.onPowerModeChanged()` now shows a short `Toast` on the main thread whenever the power mode changes automatically; message uses 4 string resources (`power_mode_performance`, `power_mode_balanced`, `power_mode_power_saver`, `power_mode_ultra_low_power`); uses `Handler(Looper.getMainLooper())` to marshal from the IO coroutine scope

### Fixed
- `ICS213ReportScreen`: WebView dependency removed from the report preview entirely; the form is now rendered as a pure Compose `LazyColumn` directly from `ICS213ReportData` (white background, monospace font, priority badges, signature blocks); this eliminates the Android 11 Trichrome crash where `Package not found: com.google.android.webview` prevented the report from showing at all
- `ICS213ReportScreen` print/share button: tries `ICS213PrintHelper` (WebView + PrintManager) first; if WebView throws (broken Trichrome), falls back to writing the HTML to the app cache and sharing it via `FileProvider` so the user can open and print it in any browser; `ICS213PrintHelper.printReport()` now lets the exception propagate so the caller can handle the fallback
- `CompositeMessageClassifier`: TFLite results with confidence below `EMERGENCY_CONFIDENCE_THRESHOLD` (0.25f) were still showing emergency badges because `mapToPriority("MEDICAL"/"COLLAPSE")` returns `CRITICAL`, bypassing the confidence gate in `shouldShowEmergencyBadge()`; TFLite priority is now capped to `NORMAL` when confidence < threshold so only keyword-matched results keep their CRITICAL/HIGH bypass
- `KeywordMessageClassifier`: messages like "I can't move" (injury/entrapment) did not trigger the `LocationAttachSheet` because no matching CRITICAL keyword existed; added entrapment/mobility-loss phrases to `CRITICAL_KEYWORDS`: `CAN'T MOVE`, `CANT MOVE`, `CANNOT MOVE`, `CAN NOT MOVE` (→ MEDICAL), `TRAPPED UNDER`, `I AM TRAPPED`, `I'M TRAPPED`, `IM TRAPPED` (→ COLLAPSE), `TRAPPED INSIDE` (→ MEDICAL)
- ICS-213 report: date field rendered as `2026--0-3-` due to double-formatting; now uses `yyyy-MM-dd` directly
- ICS-213 report: same-sender messages within 5-minute window were merged into one row; each incident now renders as a separate row
- ICS-213 report: GPS coordinates truncated mid-number when original text exceeded 80 chars; location part (`\n📍 …`) is now split out before truncation and preserved in full
- ICS-213 report: time ranges (`17:49:12–17:49:32`) shown for consolidated entries; removed with per-message rows
- `CategoryMessagesScreen` filter missed `shouldShowEmergencyBadge` check, showing low-confidence messages in category view
- `"COLLAPSED"` keyword mapped to COLLAPSE (structural); reclassified as MEDICAL since "person collapsed" is the dominant context; structural collapse still caught by `"BUILDING COLLAPSED"` and `"STRUCTURE COLLAPSE"`
- `CompositeMessageClassifier` now skips messages shorter than 3 words (e.g. `"."`, `"hey"`) to prevent false-positive badge display; standalone `KeywordMessageClassifier` (used for priority-queue urgency) is unaffected so `"SOS"` still receives CRITICAL priority
- `ClassifierUtils.mapToPriority` returned `LOW` for unknown TFLite categories; corrected to `NORMAL`
- PRIVACY_POLICY.md updated to document voluntary emergency location sharing added in this release

----------------------------------------------------------
----------------------------------------------------------

## Upstream BitChat history (archived)
## [1.4.0] - 2025-10-15
### Fixed
- fix: Resolve debug settings bottom sheet crash on some devices (Issue #472)
  - Fixed IllegalFormatConversionException in DebugSettingsSheet.kt when scrolling through debug settings
  - Corrected string formatting for debug_target_fpr_fmt and debug_derived_p_fmt string resources
  - Improved string resource parameter handling for numeric values

## [0.7.2] - 2025-07-20
### Fixed
- fix: battery optimization screen content scrollable with fixed buttons

## [0.7.1] - 2025-07-19

### Added
- feat(battery): add battery optimization management for background reliability

### Fixed
- fix: center align toolbar item in ChatHeader - passed modifier.fillmaxHeight so the content inside the row can actually be centered
- fix: update sidebar text to use string resources
- fix(chat): cursor location and enhance message input with slash command styling

### Changed
- refactor: remove context attribute at ChatViewModel.kt
- Refactor: Migrate MainViewModel to use StateFlow

### Improved
- Use HorizontalDivider instead of deprecated Divider
- Use contentPadding instead of padding so items remain fully visible


and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7]

### Added
- Location services check during app startup with educational UI
- Message text selection functionality in chat interface
- Enhanced RSSI tracking and unread message indicators
- Major Bluetooth connection architecture refactoring with dedicated managers

### Fixed
- **Critical**: Android-iOS message fragmentation compatibility issues
  - Fixed fragment size (500→150 bytes) and ID generation for cross-platform messaging
  - Ensures Android can properly communicate with iOS devices
- DirectMessage notifications and text copying functionality
- Smart routing optimizations (no relay loops, targeted delivery)
- Build system compilation issues and null pointer exceptions

### Changed
- Comprehensive dependency updates (AGP 8.10.1, Kotlin 2.2.0, Compose 2025.06.01)
- Optimized BLE scan intervals for better battery performance
- Reduced excessive logging output

### Improved
- Cross-platform compatibility with iOS and Rust implementations
- Connection stability through architectural improvements
- Battery performance via scan duty cycling
- User onboarding with location services education

## [0.6]

### Added
- Channel password management with `/pass` command for channel owners
- Monochrome/themed launcher icon for Android 12+ dynamic theming support
- Unit tests package with initial testing infrastructure
- Production build optimization with code minification and shrinking
- Native back gesture/button handling for all app views

### Fixed
- Favorite peer functionality completely restored and improved
  - Enhanced favorite system with fallback mechanism for peers without key exchange
  - Fixed UI state updates for favorite stars in both header and sidebar
  - Improved favorite persistence across app sessions
- `/w` command now displays user nicknames instead of peer IDs
- Button styling and layout improvements across the app
  - Enhanced back button positioning and styling
  - Improved private chat and channel header button layouts
  - Fixed button padding and alignment issues
- Color scheme consistency updates
  - Updated orange color throughout the app to match iOS version
  - Consistent color usage for private messages and UI elements
- App startup reliability improvements
  - Better initialization sequence handling
  - Fixed null pointer exceptions during startup
  - Enhanced error handling and logging
- Input field styling and behavior improvements
- Sidebar user interaction enhancements
- Permission explanation screen layout fixes with proper vertical padding

### Changed
- Updated GitHub organization references in project files
- Improved README documentation with updated clone URLs
- Enhanced logging throughout the application for better debugging

## [0.5.1] - 2025-07-10

### Added
- Bluetooth startup check with user prompt to enable Bluetooth if disabled

### Fixed
- Improved Bluetooth initialization reliability on first app launch

## [0.5] - 2025-07-10

### Added
- New user onboarding screen with permission explanations
- Educational content explaining why each permission is required
- Privacy assurance messaging (no tracking, no servers, local-only data)

### Fixed
- Comprehensive permission validation - ensures all required permissions are granted
- Proper Bluetooth stack initialization on first app load
- Eliminated need for manual app restart after installation
- Enhanced permission request coordination and error handling

### Changed
- Improved first-time user experience with guided setup flow

## [0.4] - 2025-07-10

### Added
- Push notifications for direct messages
- Enhanced notification system with proper click handling and grouping

### Improved
- Direct message (DM) view with better user interface
- Enhanced private messaging experience

### Known Issues
- Favorite peer functionality currently broken

## [0.3] - 2025-07-09

### Added
- Battery-aware scanning policies for improved power management
- Dynamic scan behavior based on device battery state

### Fixed
- Android-to-Android Bluetooth Low Energy connections
- Peer discovery reliability between Android devices
- Connection stability improvements

## [0.2] - 2025-07-09

### Added
- Initial Android implementation of bitchat protocol
- Bluetooth Low Energy mesh networking
- End-to-end encryption for private messages
- Channel-based messaging with password protection
- Store-and-forward message delivery
- IRC-style commands (/msg, /join, /clear, etc.)
- RSSI-based signal quality indicators

### Fixed
- Various Bluetooth handling improvements
- User interface refinements
- Connection reliability enhancements

## [0.1] - 2025-07-08

### Added
- Initial release of bitchat Android client
- Basic mesh networking functionality
- Core messaging features
- Protocol compatibility with iOS bitchat client

[Unreleased]: https://github.com/permissionlesstech/bitchat-android/compare/0.5.1...HEAD
[0.5.1]: https://github.com/permissionlesstech/bitchat-android/compare/0.5...0.5.1
[0.5]: https://github.com/permissionlesstech/bitchat-android/compare/0.4...0.5
[0.4]: https://github.com/permissionlesstech/bitchat-android/compare/0.3...0.4
[0.3]: https://github.com/permissionlesstech/bitchat-android/compare/0.2...0.3
[0.2]: https://github.com/permissionlesstech/bitchat-android/compare/0.1...0.2
[0.1]: https://github.com/permissionlesstech/bitchat-android/releases/tag/0.1
