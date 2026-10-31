# SanketSetu UI design system

One palette, one set of components, light and dark. If a screen needs a colour, it asks for a *role*.

## Colours — `Sanket.colors` (`ui/brand/SanketTokens.kt`)

| Role | Use |
|---|---|
| `paper` / `surface` / `surfaceAlt` | app background / cards and sheets / chips and inputs |
| `ink` / `muted` | primary / secondary text |
| `line` | borders and dividers (never text) |
| `blue`, `sos`, `safe`, `warn`, `violet` | saturated **fills**: buttons, stripes, badges, rings |
| `blueInk`, `sosInk`, `safeInk`, `warnInk`, `violetInk` | the same hues as **text and icons** |
| `…Soft` | quiet tinted backgrounds (put `ink`/`muted` text on them, nothing else) |
| `onBlue`, `onSos`, `onSafe`, `onWarn` | text on a saturated fill |

**Fill vs ink is the rule that matters.** SOS red `#D9381E` is fine behind white text (4.6:1) but only 4.2:1 as text on the paper
background, so red text uses `sosInk`. Do not put accent-coloured text on its own tint (4.0–4.4:1).
`SanketTokensContrastTest` asserts every pairing in use, for both palettes; add a pair there when you introduce one.

The light palette keeps the specified emergency colours: SOS `#D9381E`, safe `#15803D`, ink `#111827`, cards `#FFFFFF`.
Paper is the logo's warm `#F6F4EF` rather than `#F7F8FA`, so the app matches the launcher icon and splash.

## Components (`ui/brand/SanketUi.kt`)

`SanketCard` (optional severity stripe) · `StatusPill` · `ScreenHeader` · `SanketButton` · `EmptyState` · `SanketSectionLabel`, with
`Tone` (Neutral, Blue, Sos, Safe, Warn, Violet) providing `.ink()`, `.soft()`, `.fill()`, `.onFill()`.
Navigation is `SanketTabBar`: five fixed slots. Touch targets are at least 48 dp for SOS controls, 44 dp in the message input.

## Typography

System sans (`ui/theme/Typography.kt`). Monospace is kept only where alignment matters: peer IDs, debug tools, the ICS-213 form view.

## Reviewing a change visually

```bash
SNAPSHOTS=1 ./gradlew :app:testDebugUnitTest --tests '*Snapshot*'
open app/build/ui-snapshots
```

Renders Chat, SOS (idle and mid-rescue), Alerts, Radar, AI, onboarding and the load screen in light and dark at 412 × 915 dp.
It is a review aid, not a regression test (skipped unless `SNAPSHOTS=1`). Rendering is Robolectric native graphics on the JVM:
layout, colour and spacing are faithful, but host fonts differ from a phone and some emoji (e.g. 🆘) may draw as an empty box.
