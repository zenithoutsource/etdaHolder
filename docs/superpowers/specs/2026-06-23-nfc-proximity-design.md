# NFC & ISO 18013-5 Proximity Presentation — Design Spec

> **Status:** Approved
> **Date:** 2026-06-23
> **Author:** Brainstorming session

---

## 1. Context — Why This Change

etdaWallet is a decentralized digital wallet (Holder role) that currently supports:
- **Credential issuance** via OID4VCI 1.0 (QR scan or deep link)
- **Online presentation** via OID4VP 1.0 (QR scan → HTTP direct_post)

**What's missing:** Offline credential presentation. When a user needs to show their digital ID at a physical checkpoint (airport, police check, government office), there's no internet-dependent flow. The phone must communicate directly with a reader device via NFC and Bluetooth.

**ISO 18013-5** is the international standard for this — originally designed for mobile driving licences (mDL), now used for any government-issued digital credential presented in person.

**Hardware:** ACR1311U-N2 Bluetooth NFC reader will serve as the Verifier-side reader for testing and potentially production use.

**Constraint:** Current Issuer only issues JWT/SD-JWT format. ISO 18013-5 requires mDOC (CBOR) format. A test mDOC issuer is needed for development. Production Issuer will add mDOC support later.

**ADR references:**
- ADR 0003: ISO 18013-5 chosen for NFC proximity presentation
- ADR 0006: Native mdoc module selection deferred until physical device testing

---

## 2. System Overview

etdaWallet sits in a 3-party trust model:

```
Issuer (ผู้ออกเอกสาร)          Verifier (ผู้ตรวจ)
กรมการปกครอง, กรมขนส่ง          ตำรวจ, ด่านตรวจ, สนามบิน
        │                              ▲
        │ Issue credential             │ Present credential
        ▼                              │
    Holder Wallet (คุณ) ───────────────┘
    etdaWallet app on phone
```

**Two presentation channels:**

| Channel | Protocol | Transport | Format | Internet? | Status |
|---|---|---|---|---|---|
| Online | OID4VP 1.0 | HTTP direct_post | SD-JWT / JWT | Yes | Implemented |
| Offline (NFC) | ISO 18013-5 | NFC engagement → BLE data | mDOC (CBOR) | **No** | **New — this spec** |

Additionally, NFC can serve as a QR replacement for online flows (tap NFC tag instead of scan QR).

---

## 3. NFC Use Cases (3 Modes)

### Mode 1: NFC Tag Read → OID4VP (Online)
- Phone taps NFC NDEF tag containing `openid4vp://` URI
- Same as scanning QR code — triggers existing OID4VP flow
- Data goes over internet

### Mode 2: NFC Tag Read → OID4VCI (Online)
- Phone taps NFC NDEF tag containing `openid-credential-offer://` URI
- Same as scanning QR code — triggers existing credential issuance flow
- Data goes over internet

### Mode 3: NFC Device Engagement → BLE → ISO 18013-5 (Offline)
- Phone taps ACR1311U-N2 reader
- NFC tap exchanges BLE connection info (device engagement)
- Credential data transfers over BLE — no internet required
- mDOC format (CBOR), session-encrypted (AES-256-GCM)

---

## 4. Architecture

### 4.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────┐
│                    etdaWallet App                      │
│                                                        │
│  ┌────────────────┐   ┌────────────────────────────┐  │
│  │ UI Layer        │   │ Service Layer               │  │
│  │ (React Native)  │   │                             │  │
│  │                 │   │ src/services/nfc/            │  │
│  │ Consent screen  │◄─►│   nfcTagService.ts          │  │
│  │ Waiting screen  │   │   (Mode 1 & 2: tag read)    │  │
│  │ Result screen   │   │                             │  │
│  │                 │   │ src/services/proximity/      │  │
│  │                 │◄─►│   proximityPresentation.ts   │  │
│  │                 │   │   mdocStorage.ts             │  │
│  │                 │   │   mdocParser.ts              │  │
│  │                 │   │   deviceAuth.ts              │  │
│  └────────────────┘   └──────────────┬───────────────┘  │
│                                       │                  │
│                        ┌──────────────▼───────────────┐  │
│                        │ Native Layer                  │  │
│                        │                               │  │
│                        │ react-native-nfc-manager      │  │
│                        │   (Mode 1 & 2: NDEF read)     │  │
│                        │                               │  │
│                        │ expo-mdoc-proximity            │  │
│                        │   (Mode 3: ISO 18013-5)       │  │
│                        │   wraps Google identity-       │  │
│                        │   credential library           │  │
│                        └───────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Mode 3 Detailed Flow (ISO 18013-5 Proximity)

```
Step 1: User taps "Present via NFC"
Step 2: Selects which credential to present
Step 3: Phone starts NFC HCE broadcast (waiting for reader)
Step 4: Verifier taps ACR1311U-N2 reader near phone
Step 5: NFC exchange → device engagement (BLE UUID + device key info)
Step 6: Phone and reader connect via BLE
Step 7: Reader sends mdoc Request (which fields it wants)
Step 8: Wallet shows consent screen (requested fields listed)
Step 9: User approves via biometric
Step 10: Wallet signs DeviceAuth with Ed25519 key
Step 11: Encrypted response sent over BLE
Step 12: Done — reader confirms credential valid
```

### 4.3 Storage Strategy

| Credential format | Storage | Why |
|---|---|---|
| JWT / SD-JWT (existing) | Encrypted MMKV + Keychain | Already implemented, works well |
| mDOC (new) | Google IdentityCredential Store | Hardware-backed on supported devices, designed for mDOC |

Both formats can coexist for the same logical credential (e.g., ThaiNationalID may have both JWT and mDOC versions).

### 4.4 Signing Strategy

| Context | Key | Algorithm |
|---|---|---|
| OID4VP online (existing) | Keychain Ed25519 | EdDSA |
| ISO 18013-5 DeviceAuth (new) | Same Keychain Ed25519 (primary) | EdDSA |
| Fallback if verifier needs P-256 | New P-256 key in Keychain | ES256 |

ISO 18013-5 supports both EdDSA and ES256. Start with Ed25519 (already have), add P-256 fallback if interop issues arise.

---

## 5. Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Native mdoc library | Google `com.android.identity:identity-credential` | Official, interop-tested, handles NFC+BLE+encryption |
| Platform priority | Android first (Galaxy S24 Ultra) | Test device available, iOS deferred |
| Branch strategy | Separate branch per phase | Independent work streams, clean PRs |
| mDOC storage | Google IC Store (not MMKV) | Hardware-backed, designed for mDOC |
| Device key | Ed25519 primary, P-256 fallback | Reuses existing key, ISO 18013-5 supports EdDSA |
| Test mDOC issuer | Local Node.js in server/ | Unblocks dev without waiting for real Issuer changes |
| NFC tag reading library | react-native-nfc-manager | Most popular RN NFC lib, well-maintained |

---

## 6. Phased Implementation

### Phase 1: NFC Tag Read (Online triggers)
- **Branch:** `feat/nfc-tag-read`
- **Effort:** ~3-5 days
- **Blocked on reader:** No
- **What:** Install `react-native-nfc-manager`, read NDEF tags, route URIs to existing OID4VP/OID4VCI flows
- **New files:**
  - `src/services/nfc/nfcTagService.ts`
  - `src/services/nfc/nfcTagService.test.ts`
- **Modified files:**
  - `app/_layout.tsx` (NFC init)
  - `app.json` (NFC permission)

### Phase 2A: Test mDOC Issuer
- **Branch:** `feat/mdoc-issuer`
- **Effort:** ~3-5 days
- **Blocked on reader:** No
- **What:** Node.js issuer generating valid mDOC CBOR with test IACA certs
- **New files:** `server/mdoc-issuer/` directory
- **Dependencies:** `cbor`, `cose-js`, `@noble/curves`, `express`

### Phase 2B: Expo Native Module
- **Branch:** `feat/proximity-presentation`
- **Effort:** ~1-2 weeks
- **Blocked on reader:** Partial (init/build: No, E2E: Yes)
- **What:** Expo Config Plugin wrapping Google IC library
- **New files:** `expo-mdoc-proximity/` directory
- **Android permissions:** NFC, BLUETOOTH, BLUETOOTH_ADMIN, BLUETOOTH_ADVERTISE, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION

### Phase 2C: Wallet Service Layer + UI
- **Branch:** `feat/proximity-presentation` (same as 2B)
- **Effort:** ~1 week
- **Blocked on reader:** No
- **What:** TypeScript services, Zustand store, consent UI components
- **New files:**
  - `src/services/proximity/` (4 files)
  - `src/store/proximityStore.ts`
  - `src/components/proximity/` (4 components)
  - `app/(tabs)/present.tsx`

### Phase 2D: E2E Integration Test
- **Effort:** ~3-5 days
- **Blocked on reader:** **Yes — needs ACR1311U-N2**
- **What:** Full end-to-end: issue test mDOC → store → NFC tap → consent → verify

### Phase 3: Verifier Web App (Future)
- Separate project
- Web app + Web Bluetooth → ACR1311U-N2
- Deferred until wallet proximity works

---

## 7. UI Flow

```
Home Screen
    │
    ├── [Credential Card] → Credential Detail
    │                           │
    │                           └── [Present via NFC] ←── New action
    │                                    │
    │                                    ▼
    │                           Select Credential
    │                           (if multiple mDOC available)
    │                                    │
    │                                    ▼
    │                           Waiting for Tap...
    │                           "Hold phone near reader"
    │                           [Cancel]
    │                                    │
    │                                    │ NFC tap detected
    │                                    ▼
    │                           Consent Screen
    │                           ☑ Full Name
    │                           ☑ Date of Birth
    │                           ☐ Address (not requested)
    │                           [Allow] [Deny]
    │                                    │
    │                                    │ Biometric approve
    │                                    ▼
    │                           Success!
    │                           Shared: Name, DOB
    │                           [Done]
    │
    └── (NFC tag tap from outside app)
            │
            ▼
        Route to OID4VP or OID4VCI
        (existing flows)
```

**New components:**
- `src/components/proximity/ProximityPresentButton.tsx`
- `src/components/proximity/WaitingForTapPanel.tsx`
- `src/components/proximity/ConsentPanel.tsx`
- `src/components/proximity/PresentationResultPanel.tsx`

---

## 8. Testing Strategy

| What | How | Needs reader? |
|---|---|---|
| NFC tag read (Mode 1 & 2) | Physical device + NDEF tags | No (any NFC tag) |
| Test mDOC Issuer | `yarn test` — unit tests | No |
| mDOC parser/storage | Unit tests — CBOR structure | No |
| Service layer | Unit tests — mock native module | No |
| Consent UI components | Component tests | No |
| Native module initialization | Dev build on phone | No |
| Full proximity E2E | Physical device + ACR1311U-N2 | **Yes** |

---

## 9. Zustand Store Shape

```typescript
interface ProximityState {
  status: 'idle' | 'waiting' | 'engaged' | 'requested' | 'approved' | 'complete' | 'error'
  requestedFields: string[] | null
  selectedCredentialId: string | null
  error: string | null
  startPresentation: (credentialId: string) => Promise<void>
  approvePresentation: () => Promise<void>
  denyPresentation: () => void
  reset: () => void
}
```

---

## 10. Native Module JS API

```typescript
// expo-mdoc-proximity/src/index.ts

// Start listening for NFC device engagement
startProximityPresentation(mdocBytes: Uint8Array, deviceKeyId: string): Promise<void>

// Stop/cancel
stopProximityPresentation(): Promise<void>

// Events:
// "onDeviceEngaged" — NFC tap received, BLE connecting
// "onRequestReceived" — { requestedFields: string[] }
// "onPresentationComplete" — success
// "onError" — { code: string, message: string }
```

---

## 11. Error Handling

| Error | User sees | Log tag |
|---|---|---|
| NFC not available | "NFC not supported on this device" | `[nfc-init]` |
| NFC disabled | "Please enable NFC in Settings" | `[nfc-init]` |
| BLE connection failed | "Connection lost. Try again." | `[proximity-ble]` |
| Reader timeout | "Reader did not respond. Try again." | `[proximity-engagement]` |
| User denied consent | Return to home (no error) | `[proximity-consent]` |
| Signing failed | "Authentication failed. Try again." | `[proximity-auth]` |
| mDOC not found | "No credential available for proximity" | `[proximity-storage]` |

---

## 12. Security Considerations

- mDOC private key (Ed25519) never leaves Keychain — same protection as existing OID4VP
- BLE data encrypted with session keys (AES-256-GCM) per ISO 18013-5
- Biometric gate required before every presentation
- No credential data logged (per CLAUDE.md: no VC payloads, JWT, PII in logs)
- Session keys ephemeral — destroyed after presentation complete
- Reader authentication: verify reader certificate chain when available
