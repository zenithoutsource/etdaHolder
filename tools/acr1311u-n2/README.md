# ACR1311U-N2 companion Companion Probe

Host-side reference for exercising the companion companion APDU profile defined in
[`docs/superpowers/specs/nfc-companion-apdu.md`](../../docs/superpowers/specs/nfc-companion-apdu.md).

## Prerequisites

- ACS ACR1311U-N2 reader on the host PC
- ACS PC/SC or vendor SDK installed
- Wallet dev build armed for dual-format NFC (`dual-format` profile)

## Protocol summary

1. `SELECT` companion AID `A00000045444410100`
2. `80 CA 00 00 00` — GET CAPABILITIES (CBOR)
3. `80 CB 00 00 Lc` — BEGIN COMPANION with CBOR `{ mode, nonce, profile_id }`
4. Chain `80 C0 00 00 Le` while `SW=61XX`
5. Verify SD-JWT + KB-JWT (`aud=urn:etda:companion:nfc:v1`, nonce binding)

Pinned constants: `src/services/proximity/companionTransport/plugins/companionV1/constants.ts`.

## Script

`companion_probe.ts` is a **stub** until the ACS SDK is wired for this repo.
Implement using the sequence in spec §11 when a physical reader is available.

```bash
# Future (after SDK binding):
# npx ts-node tools/acr1311u-n2/companion_probe.ts
```

## Related

- Parent design: `docs/superpowers/specs/2026-07-03-android-hce-dual-format-presentation-design.md`
- Wallet arm flow: `src/services/proximity/proximityArmSession.ts`
