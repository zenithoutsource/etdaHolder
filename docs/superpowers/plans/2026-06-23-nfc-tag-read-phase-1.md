# NFC Tag Read Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phase 1 NFC NDEF tag reading on the Scan tab so supported `openid-credential-offer://...` and `openid4vp://...` payloads route into the wallet’s existing issuance and OID4VP flows.

**Architecture:** Keep NFC as a transport adapter only. A new `nfcTagService` reads a single NDEF tag, extracts a supported URI, and hands it back to existing Scan/deeplink logic. The Scan screen owns the user-triggered NFC action and UI state, while startup only performs native-safe initialization on non-web platforms.

**Tech Stack:** Expo Router, React Native, NativeWind, `react-native-nfc-manager`, Jest, Testing Library

---

### Task 1: Add NFC service coverage first

**Files:**
- Create: `src/services/nfc/nfcTagService.ts`
- Create: `src/services/nfc/nfcTagService.test.ts`
- Check: `src/store/deeplinkStore.ts`

- [ ] **Step 1: Write the failing NFC service tests**

```ts
import {
  NfcUnsupportedError,
  NfcDisabledError,
  NfcReadCancelledError,
  NfcUnsupportedTagError,
  classifyNfcPayloadUri,
  readNdefPayloadUri,
} from './nfcTagService'

describe('classifyNfcPayloadUri', () => {
  it('classifies credential offer URIs', () => {
    expect(classifyNfcPayloadUri('openid-credential-offer://?credential_offer={}')).toEqual({
      kind: 'credential-offer',
      uri: 'openid-credential-offer://?credential_offer={}',
    })
  })

  it('classifies OID4VP URIs', () => {
    expect(classifyNfcPayloadUri('openid4vp://?response_type=vp_token')).toEqual({
      kind: 'oid4vp',
      uri: 'openid4vp://?response_type=vp_token',
    })
  })

  it('rejects unsupported URIs', () => {
    expect(() => classifyNfcPayloadUri('https://example.com')).toThrow(NfcUnsupportedTagError)
  })
})

describe('readNdefPayloadUri', () => {
  it('extracts a URI record payload', () => {
    expect(readNdefPayloadUri({
      ndefMessage: [
        { tnf: 1, type: [85], payload: [0, ...Buffer.from('openid4vp://?response_type=vp_token')] },
      ],
    })).toBe('openid4vp://?response_type=vp_token')
  })

  it('extracts a text record payload', () => {
    expect(readNdefPayloadUri({
      ndefMessage: [
        { tnf: 1, type: [84], payload: [2, 101, 110, ...Buffer.from('openid-credential-offer://?credential_offer={}')] },
      ],
    })).toBe('openid-credential-offer://?credential_offer={}')
  })

  it('rejects records without supported payloads', () => {
    expect(() => readNdefPayloadUri({ ndefMessage: [] })).toThrow(NfcUnsupportedTagError)
  })
})
```

- [ ] **Step 2: Run the NFC service tests to verify RED**

Run: `yarn test src/services/nfc/nfcTagService.test.ts --runInBand`
Expected: FAIL with missing module or missing exported functions/errors

- [ ] **Step 3: Write the minimal NFC service**

```ts
import { Platform } from 'react-native'
import NfcManager, { Ndef, NfcEvents, NfcTech, type TagEvent } from 'react-native-nfc-manager'

import { isCredentialOfferDeeplink, isSupportedWalletDeeplink } from '../../store/deeplinkStore'
import { logWalletError, logWalletStep } from '../debug/walletLogger'

export type NfcPayloadClassification =
  | { kind: 'credential-offer'; uri: string }
  | { kind: 'oid4vp'; uri: string }

export class NfcUnsupportedError extends Error {}
export class NfcDisabledError extends Error {}
export class NfcReadCancelledError extends Error {}
export class NfcUnsupportedTagError extends Error {}

let initPromise: Promise<void> | null = null

export function classifyNfcPayloadUri(uri: string): NfcPayloadClassification {
  if (isCredentialOfferDeeplink(uri)) return { kind: 'credential-offer', uri }
  if (isSupportedWalletDeeplink(uri)) return { kind: 'oid4vp', uri }
  throw new NfcUnsupportedTagError('Unsupported NFC content')
}

export function readNdefPayloadUri(tag: Pick<TagEvent, 'ndefMessage'>): string {
  const records = tag.ndefMessage ?? []
  for (const record of records) {
    const payload = Ndef.text.decodePayload(record.payload) ?? Ndef.uri.decodePayload(record.payload)
    if (typeof payload === 'string' && payload.length > 0) return payload.trim()
  }
  throw new NfcUnsupportedTagError('Unsupported NFC content')
}

export async function initNfc(): Promise<void> {
  if (Platform.OS === 'web') return
  if (!initPromise) {
    initPromise = (async () => {
      const supported = await NfcManager.isSupported()
      if (!supported) throw new NfcUnsupportedError('NFC not supported on this device')
      await NfcManager.start()
    })()
  }
  return initPromise
}

export async function readSingleNfcPayload(): Promise<NfcPayloadClassification> {
  await initNfc()
  const enabled = await NfcManager.isEnabled()
  if (!enabled) throw new NfcDisabledError('NFC is disabled')
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef)
    const tag = await NfcManager.getTag()
    return classifyNfcPayloadUri(readNdefPayloadUri(tag))
  } catch (error) {
    if (String(error).includes('cancelled')) throw new NfcReadCancelledError('NFC scan cancelled')
    throw error
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => undefined)
  }
}
```

- [ ] **Step 4: Run the NFC service tests to verify GREEN**

Run: `yarn test src/services/nfc/nfcTagService.test.ts --runInBand`
Expected: PASS

- [ ] **Step 5: Refactor the NFC service for typed payload helpers and logging**

```ts
function decodeRecordPayload(payload: number[] | Uint8Array): string | null {
  try {
    return Ndef.uri.decodePayload(payload)
  } catch {}
  try {
    return Ndef.text.decodePayload(payload)
  } catch {}
  return null
}
```

- [ ] **Step 6: Commit**

```bash
git add src/services/nfc/nfcTagService.ts src/services/nfc/nfcTagService.test.ts
git commit -m "test: cover NFC tag parsing"
```

### Task 2: Wire Scan tab NFC behavior through tests first

**Files:**
- Modify: `src/screens/ScanScreenDeeplink.test.tsx`
- Modify: `app/(tabs)/scan.tsx`
- Check: `src/screens/CredentialOfferClaimScreen.tsx`

- [ ] **Step 1: Write the failing Scan screen tests**

```ts
jest.mock('../services/nfc/nfcTagService', () => ({
  readSingleNfcPayload: jest.fn(),
  NfcDisabledError: class NfcDisabledError extends Error {},
  NfcUnsupportedTagError: class NfcUnsupportedTagError extends Error {},
  NfcReadCancelledError: class NfcReadCancelledError extends Error {},
}))

it('stores NFC credential-offer payloads in the deeplink store', async () => {
  readSingleNfcPayloadMock.mockResolvedValue({
    kind: 'credential-offer',
    uri: 'openid-credential-offer://?credential_offer={}',
  })

  render(<ScanScreen />)
  fireEvent.press(screen.getByText('Use NFC'))

  await waitFor(() => {
    expect(useDeeplinkStore.getState().pendingUri).toBe('openid-credential-offer://?credential_offer={}')
  })
})

it('routes NFC OID4VP payloads into the existing Scan handler', async () => {
  presentationRequestMock.mockReturnValue(true)
  readSingleNfcPayloadMock.mockResolvedValue({
    kind: 'oid4vp',
    uri: 'openid4vp://?response_type=vp_token',
  })

  render(<ScanScreen />)
  fireEvent.press(screen.getByText('Use NFC'))

  await waitFor(() => {
    expect(resolvePresentationRequestMock).toHaveBeenCalled()
  })
})

it('shows a direct message when NFC is disabled', async () => {
  readSingleNfcPayloadMock.mockRejectedValue(new NfcDisabledError('NFC is disabled'))

  render(<ScanScreen />)
  fireEvent.press(screen.getByText('Use NFC'))

  expect(await screen.findByText('Please enable NFC in Settings and try again.')).toBeOnTheScreen()
})
```

- [ ] **Step 2: Run the Scan screen tests to verify RED**

Run: `yarn test src/screens/ScanScreenDeeplink.test.tsx --runInBand`
Expected: FAIL because the Scan screen does not render an NFC action yet

- [ ] **Step 3: Add the minimal Scan NFC flow**

```ts
type ScanPhase =
  | { tag: 'scanning' }
  | { tag: 'resolving' }
  | { tag: 'readingNfc' }
  | { tag: 'error'; message: string }

async function handleNfcPress() {
  const gen = generationRef.current
  setPhase({ tag: 'readingNfc' })
  try {
    const payload = await readSingleNfcPayload()
    if (payload.kind === 'credential-offer') {
      setPendingDeeplinkUri(payload.uri)
      resetScanner()
      return
    }
    await handleBarcode(payload.uri)
  } catch (error) {
    if (error instanceof NfcReadCancelledError) {
      resetScanner()
      return
    }
    if (error instanceof NfcDisabledError) {
      setPhase({ tag: 'error', message: 'Please enable NFC in Settings and try again.' })
      return
    }
    if (error instanceof NfcUnsupportedTagError) {
      setPhase({ tag: 'error', message: 'This NFC tag is not supported by the wallet.' })
      return
    }
    setPhase({ tag: 'error', message: 'Unable to read NFC tag. Please try again.' })
  }
}
```

- [ ] **Step 4: Render the NFC action and loading state**

```tsx
{isLoading ? (
  <AppButton variant="icon-circle" label="Cancel" onPress={resetScanner} ... />
) : (
  <View className="items-center gap-3">
    <AppButton
      variant="solid-block"
      label="Use NFC"
      onPress={() => { void handleNfcPress() }}
      className="min-w-[140px] rounded-xl bg-white/20 px-5 py-3"
      textClassName="text-[14px] font-semibold text-white"
    />
  </View>
)}
```

- [ ] **Step 5: Run the Scan screen tests to verify GREEN**

Run: `yarn test src/screens/ScanScreenDeeplink.test.tsx --runInBand`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/(tabs)/scan.tsx src/screens/ScanScreenDeeplink.test.tsx
git commit -m "feat: add scan-tab NFC tag handoff"
```

### Task 3: Add startup safety and platform configuration

**Files:**
- Modify: `app/_layout.tsx`
- Modify: `app.json`
- Check: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Write the failing startup test or narrow assertion**

```ts
it('does not import or start NFC on web startup', async () => {
  Platform.OS = 'web'
  render(<RootLayout />)
  expect(initNfcMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the targeted test to verify RED**

Run: `yarn test src/screens/ScanScreenDeeplink.test.tsx src/store/deeplinkStore.test.ts --runInBand`
Expected: FAIL or remain insufficient until startup wiring is added

- [ ] **Step 3: Add native-safe startup init and Android permissions**

```ts
if (Platform.OS !== 'web') {
  const [{ initNfc }] = await Promise.all([
    import('@/src/services/nfc/nfcTagService'),
  ])
  await initNfc()
}
```

```json
"android": {
  "permissions": ["android.permission.NFC"]
}
```

- [ ] **Step 4: Run targeted tests to verify GREEN**

Run: `yarn test src/services/nfc/nfcTagService.test.ts src/screens/ScanScreenDeeplink.test.tsx src/store/deeplinkStore.test.ts --runInBand`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/_layout.tsx app.json
git commit -m "chore: initialize NFC for native builds"
```

### Task 4: Finish verification and docs

**Files:**
- Modify: `docs/TASKS.md`
- Check: `package.json`

- [ ] **Step 1: Update the backlog and session notes**

```md
[x] Integrate NFC NDEF reader for offer URI after device testing is available
```

Add a session note summarizing:
- `react-native-nfc-manager` Phase 1 NDEF intake
- Scan-tab NFC action
- credential-offer and OID4VP routing reuse
- tests run

- [ ] **Step 2: Run focused tests**

Run: `yarn test src/services/nfc/nfcTagService.test.ts src/screens/ScanScreenDeeplink.test.tsx src/store/deeplinkStore.test.ts --runInBand`
Expected: PASS

- [ ] **Step 3: Run type-check**

Run: `yarn tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Run lint**

Run: `yarn lint`
Expected: PASS or only the existing recorded warnings in `src/services/vci/exchangeService.test.ts`

- [ ] **Step 5: Commit final Phase 1 branch state**

```bash
git add docs/TASKS.md
git commit -m "docs: record phase 1 NFC delivery"
```
