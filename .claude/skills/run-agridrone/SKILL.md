---
name: run-agridrone
description: Run, start, build, test, screenshot, verify, smoke test the agridrone React Native / Expo mobile app
---

app-agridrone is a React Native/Expo mobile app (iOS + Android). There is no web surface worth testing — `react-native-maps` refuses to load on web and the page shows a static fallback. The agent path is a bundle smoke test via Metro; the human path is Expo Go on a real device.

## Prerequisites

No extra packages needed. `node_modules` must be installed:

```bash
npm install
```

`xcrun simctl` is broken on this machine (xcode-select points at CLI tools, not full Xcode). There are no iOS simulators configured. No Android emulator. Device-only testing for interactive sessions.

## Agent path — smoke test

Runs from the project root. Starts a fresh Metro bundler, compiles the `src/app/index.tsx` module for iOS, checks that key code markers are present in the bundle, then tears down cleanly.

```bash
bash .claude/skills/run-agridrone/smoke.sh [port]
```

- Default port: 8090. Pass a different one if it's in use.
- Takes ~20–40 s from cold cache.
- Exit 0 = all markers found + no TS errors in core files.
- Exit 1 = Metro didn't start, bundle too small, or a marker missing.

Markers checked:
| Marker | What it verifies |
|---|---|
| `loadZones` | Zone-loading function present |
| `getZones` | API call wired up |
| `FF6B00` | Orange stroke color for zones |
| `qgis/zones` | Correct API endpoint path |
| `nom_parcel` | Parcelle properties intact |
| `id_parcel` | id_parcel field lookup present |

TypeScript is checked only for `src/app/index.tsx` and `src/services/agridroneService` — pre-existing errors in unused components (`animated-icon.tsx`, `use-theme.ts`) are ignored.

## Human path — Expo Go on device

```bash
npx expo start
```

Scan the QR code with **Expo Go** (iOS or Android). On first launch Metro builds the bundle (~30 s).

What to test for the zones feature:
1. Parcelles load and appear as grey polygons on the map
2. Tap a parcelle → it turns gold, `ActivityIndicator` appears briefly
3. Console shows: `[zones] id_parcel: … | id: … | feature.id: … → using: …`
4. Orange (`#FF6B00`) zone outlines appear inside the selected parcelle
5. Tap the GPS/reset button → zones disappear
6. Tap a different parcelle → previous zones clear, new ones load

## Gotchas

- **`xcrun simctl` exits with code 72** — Expo prints `Unable to run simctl` on every start. Safe to ignore; it means no simulators, not a fatal error.
- **Port already in use** — if port 8081 is taken, Expo in non-interactive mode refuses to start (no TTY to answer "use 8082?"). Pass `--port <free-port>` explicitly.
- **Bundle endpoint for full app vs. module** — `GET /node_modules/expo-router/entry.bundle` returns a root bundle that doesn't include lazy-loaded app screens. Use `GET /src/app/index.tsx.bundle` to get the module that actually contains the screen code.
- **Metro cache** — running without `--clear` serves a cached bundle. Always pass `--clear` in the smoke script so changes are reflected.
- **Web mode crashes** — `react-native-maps` imports native-only modules; the web bundle throws at startup. The `if (Platform.OS === 'web')` guard in `index.tsx` only runs after the module system has already crashed. Web is not a viable test surface.
