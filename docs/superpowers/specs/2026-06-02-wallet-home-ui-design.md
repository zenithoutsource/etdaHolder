# Wallet Home UI Design

## Goal

Translate `docs/ui-reference/home.html` into the Expo Router wallet home screen using React Native primitives and NativeWind classes.

## Scope

- Replace the Expo starter home tab with the Wallet home screen.
- Render credential menu rows from a config array, not hardcoded screen sections.
- Add Wallet, My QR, Scan, and History Log tabs so the tab bar matches the approved home design.
- Use vector icons and an initials avatar because the referenced HTML image assets are not present in the repo.
- Remove starter tab code that becomes unreferenced.

## Architecture

`app/(tabs)/index.tsx` owns the Wallet home view and local card config. Placeholder tabs live as separate route files so future QR, scan, and history work has clear route boundaries. NativeWind setup is added only if missing, using a global CSS entry imported by `app/_layout.tsx`.

## UI Mapping

- Root background: `#f0f3f8`.
- Header: navy `#002887`, title `Wallet`, compact status/header spacing.
- Profile card: dark navy `#002854`, rounded 8px, avatar placeholder, name and holder id copy.
- Credential rows: white cards, left icon tile, title/subtitle, right chevron/badge.
- Bottom tabs: active navy, inactive grey.

## Verification

Run:

```powershell
yarn.cmd tsc --noEmit
yarn.cmd lint
```
