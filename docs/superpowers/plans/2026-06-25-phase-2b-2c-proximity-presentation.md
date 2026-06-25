# Phase 2B/2C Proximity Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the Android-first `expo-mdoc-proximity` native module, wallet proximity services, Zustand store, and consent UI so the wallet can enter the ISO 18013-5 waiting/consent flow before Phase 2D reader E2E.

**Architecture:** Follow the existing local Expo module pattern in `modules/etda-wallet-eddsa/`. Keep protocol orchestration in `src/services/proximity/` and UI in `src/components/proximity/`. NFC engagement + BLE response wiring stays blocked on the ACR1311U-N2 reader until Phase 2D.

**Tech Stack:** Expo SDK 54, Kotlin Expo Modules API, NativeWind, Zustand, Jest

---

### Task 1: Native module scaffold

**Files:**
- Create: `modules/expo-mdoc-proximity/**`
- Modify: `app.json`

- [x] Config plugin for NFC/BLE permissions
- [x] Android module with storage + presentation session lifecycle
- [x] JS bridge in `src/services/proximity/nativeProximityModule.ts`

### Task 2: Wallet service layer

**Files:**
- Create: `src/services/proximity/{mdocParser,mdocStorage,deviceAuth,proximityPresentation}.ts`
- Create: `src/store/proximityStore.ts`

- [x] Parser, storage wrapper, device-auth signer, presentation orchestration
- [x] Zustand store matching the design spec

### Task 3: UI + routing

**Files:**
- Create: `src/components/proximity/*.tsx`
- Create: `app/(tabs)/present.tsx`
- Modify: `app/(tabs)/_layout.tsx`, `app/(tabs)/credential/[id].tsx`

- [x] Waiting, consent, and result panels
- [x] Hidden present route + credential detail entry point

### Task 4: Tests and verification

- [x] `mdocParser.test.ts`
- [x] `proximityPresentation.test.ts`
- [ ] `yarn tsc --noEmit`
- [ ] `yarn test`
- [ ] `yarn lint`

### Task 5: Phase 2D follow-up (blocked on reader)

- [ ] Wire NFC engagement listener + BLE retrieval in `MdocProximityEngine`
- [ ] Emit `onRequestReceived` / `onPresentationComplete` from native events
- [ ] E2E with ACR1311U-N2 + test mDOC issuer
