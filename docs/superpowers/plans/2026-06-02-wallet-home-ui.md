# Wallet Home UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 3.1 Wallet home tab from `docs/ui-reference/home.html`.

**Architecture:** Keep each tab as an Expo Router route. The Wallet home maps credential cards from local config and avoids backend coupling until Phase 3.2 dynamic data binding.

**Tech Stack:** Expo SDK 54, Expo Router, React Native primitives, NativeWind, `@expo/vector-icons`.

---

### Task 1: NativeWind Wiring

**Files:**
- Create: `tailwind.config.js`
- Create: `global.css`
- Create: `nativewind-env.d.ts`
- Modify: `app/_layout.tsx`

- [ ] Add Tailwind content paths for `app`, `components`, and `src`.
- [ ] Add global CSS with Tailwind directives.
- [ ] Import `global.css` once from `app/_layout.tsx`.
- [ ] Add NativeWind TypeScript reference.

### Task 2: Wallet Home Route

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] Remove Expo starter imports and parallax sample content.
- [ ] Add a credential menu config array with ID Card, Driving License, Transcript, and Medical certificate.
- [ ] Render the approved layout with `SafeAreaView`, `ScrollView`, `View`, `Text`, and `Pressable`.
- [ ] Use vector icons and an initials avatar because design image assets are missing.

### Task 3: Four Tab Routes

**Files:**
- Modify: `app/(tabs)/_layout.tsx`
- Create: `app/(tabs)/qr.tsx`
- Create: `app/(tabs)/scan.tsx`
- Create: `app/(tabs)/history.tsx`
- Delete: `app/(tabs)/explore.tsx`

- [ ] Replace Home/Explore tabs with Wallet/My QR/Scan/History Log.
- [ ] Add lightweight placeholder screens for My QR, Scan, and History Log.
- [ ] Remove the unused Expo starter Explore route.

### Task 4: Cleanup And Verification

**Files:**
- Modify: `docs/TASKS.md`

- [ ] Use `rg` to identify starter components no longer referenced.
- [ ] Delete only unreferenced starter components.
- [ ] Run `yarn.cmd tsc --noEmit`.
- [ ] Run `yarn.cmd lint`.
- [ ] Mark Phase 3.1 complete in `docs/TASKS.md` if verification passes.
