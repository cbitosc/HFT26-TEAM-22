# UI performance and verification

## Production bundle

Measured from `npm run build` on 2026-10-31. Sizes are Vite's emitted file sizes; gzip is
shown for JavaScript and CSS. Route chunks are loaded on demand.

| Entry or route | JavaScript | Gzip |
| --- | ---: | ---: |
| Shared entry | 463.63 kB | 147.46 kB |
| Home | 5.64 kB | 2.23 kB |
| SOS | 7.50 kB | 2.47 kB |
| Messages | 20.10 kB | 4.92 kB |
| Alerts | 12.65 kB | 3.53 kB |
| Safety circles | 11.42 kB | 3.06 kB |
| Map | 10.24 kB | 3.14 kB |
| Simulator | 18.94 kB | 5.51 kB |
| AI assistant | 96.60 kB | 28.11 kB |
| Settings | 22.37 kB | 5.66 kB |
| Optional 3D visual | 917.01 kB | 243.49 kB |
| Shared CSS | 39.61 kB | 8.20 kB |

The main UI uses a static CSS mesh visual. The much larger Three.js chunk is lazy-loaded only
when the user enables **3D visuals (uses more battery)**. Vite continues to warn that this
optional 3D chunk exceeds 500 kB.

## Before/after and runtime observations

- The original design rendered the 3D orb on the Home route and included grain, grid overlays,
  backdrop blur, and a circular theme transition. These effects are removed or opt-in.
- A production bundle baseline was not captured before the redesign, so a numeric before/after
  bundle comparison is unavailable.
- The browser layout was checked at 360 × 640, 360 × 800, and 412 × 915 for horizontal overflow.
  At 360 × 800, the Home SOS control and 2 × 2 stat cards fit above the bottom navigation.
- FPS and React Profiler timings were not recorded. The device build and real-radio runtime have
  not been profiled on an Android emulator or physical phone in this pass.
- Automated checks: `npm run typecheck`, `npm test`, `npm run build`, and `npm run contrast`.

## Removed effects and reduced work

- Removed film-grain and full-screen grid effects, persistent blur, and circular view transition.
- Replaced the default Three.js orb with a static CSS mesh illustration; the opt-in 3D view
  pauses for reduced motion, backgrounding, and Saver mode.
- Kept message and alert feeds paginated, limited the peer list to 12 rows per page, and used
  narrowed Zustand selectors on the redesigned Home screen.
- Metrics, UI update throttling, and debounced persistence are described with their mesh/store
  implementation. Their effect on frame time has not been measured on a device.

## Manual device check

Use the screenshot steps in the README with light mode selected. Check the SOS hold action,
keyboard/touch interaction, system font scaling, app background/resume, and screen reader labels.
Record model, Android version, screen size, battery mode, and observed frame-rate behavior before
making device performance claims. Until then, FPS and thermal behavior are **UNVERIFIED**.
