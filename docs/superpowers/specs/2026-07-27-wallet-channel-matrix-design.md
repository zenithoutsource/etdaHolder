# Wallet Channel Matrix (Documentation)

Status: Approved (brainstorming 2026-07-27)
Date: 2026-07-27

## Summary

Clarify which wallet channels are used to **receive credentials (VC)** versus **present credentials (VP)**, and which transports are online versus proximity NFC. This removes confusion between Scan tab, deep links, My QR, NFC tap, and third-party tools such as [mdoc-web-verifier](https://github.com/stelauconseil/mdoc-web-verifier) (out of scope).

No application code changes in this slice — documentation only.

## Problem

Stakeholders conflate:

- **Scan tab** with “receive only” — it also ingests Verifier OID4VP QRs (send VP online).
- **NFC** with issuance — NFC NDEF issuance is deferred; production NFC is **proximity presentation (send mdoc)** per ADR 0003.
- **mdoc-web-verifier** with production validation — it uses Web Bluetooth, not the ACR1311U-N2 NFC HCE path.

`docs/ARCHITECTURE.md` §3 still lists NFC presentation as “native module TBD” despite active `expo-mdoc-proximity` work and v1 spec `2026-07-27-mdl-mdoc-only-nfc-v1-design.md`.

## Decision

Add a **Holder channel matrix** to `docs/ARCHITECTURE.md` §3 and refresh the status table. Cross-link v1 NFC spec and explicitly exclude mdoc-web-verifier from the production path.

## Channel Matrix (normative for docs)

| User action | Channel | Protocol | Direction | Status |
|-------------|---------|----------|-----------|--------|
| Claim credential | Scan QR (`openid-credential-offer`) | OID4VCI | Receive VC | Implemented |
| Claim credential | Deep link `walletapp://callback` (issuance) | OID4VCI | Receive VC | Implemented |
| Claim credential | NFC NDEF tag (offer URI) | OID4VCI | Receive VC | Deferred |
| Present to verifier (online) | Scan QR (`openid4vp`) | OID4VP | Send VP (SD-JWT) | Implemented |
| Present to verifier (online) | Deep link `walletapp://callback` (VP) | OID4VP | Send VP | Implemented |
| Present to verifier (online) | My QR tab | OID4VP via broker | Send VP | Implemented |
| Present to reader (proximity) | Credential → NFC + engagement QR + tap | ISO 18013-5 mdoc (NFC HCE) | Send mdoc | In progress (v1 mDL) |
| Dev BLE verifier in browser | mdoc-web-verifier | ISO 18013-5 BLE | N/A | **Out of scope** |

**Rule of thumb:** Scan and deep links = **online** ingress (receive VC or send VP over the network). NFC HCE = **offline proximity send** of mdoc to a physical reader (ACR1311U-N2 target). Engagement QR on the present flow is for the **reader**, not an OID4VP Scan QR.

## Files to update

1. `docs/ARCHITECTURE.md` — §3 table + new subsection “Holder channel matrix”; NFC presentation status → in progress with link to v1 spec.
2. `docs/TASKS.md` — one-line backlog note that channel matrix doc landed (optional session entry).

## Out of scope

- UI copy changes on Scan / Present screens.
- mdoc-web-verifier integration.
- NFC NDEF issuance implementation.
- Code changes to proximity or OID4VP services.

## Acceptance

- ARCHITECTURE §3 accurately reflects receive vs send and online vs NFC.
- No “native module TBD” for NFC presentation without pointing to current module and v1 spec.
- mdoc-web-verifier listed only as explicit non-goal for production validation.
