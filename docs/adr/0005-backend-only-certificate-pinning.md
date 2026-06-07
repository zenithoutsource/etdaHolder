# ADR 0005 - Certificate Pinning Scoped to the Backend Host Only

Status: Accepted

Date: 2026-06-07

## Context

`docs/TASKS.md` Phase 4 lists "Certificate pinning decision and implementation if required" without specifying scope. The wallet has two distinct outbound network paths (`docs/SECURITY.md` §4):

- OID4VCI Issuer traffic: device-to-Issuer directly, over arbitrary hosts named in each scanned offer URI. The set of Issuers is open-ended and not known at build time.
- Company backend traffic: routed exclusively through `src/sdk/installWalletApiFetch.ts` to a single, fixed, known host (`EXPO_PUBLIC_WALLET_API_BASE_URL`).

Pinning requires bundling the expected certificate (or public key) into the app at build time. That is only possible for hosts known in advance.

## Decision

Pin only the company backend SDK host. `src/sdk/walletApiCertPinning.ts` wraps the fetch adapter's underlying `fetch` with `react-native-ssl-pinning`, validating pinned certificates (`EXPO_PUBLIC_WALLET_API_PINNED_CERTS`) for HTTPS requests whose hostname matches the configured backend base URL — and only those requests. Issuer calls, non-HTTPS targets (the plain-HTTP local/LAN dev backend), and web builds fall through to standard TLS validation via the original fetch.

## Consequences

- Issuer traffic keeps standard OS-trust-store TLS validation. Pinning it would be infeasible — the wallet cannot pre-bundle certificates for issuers it has never seen, and attempting to would break issuance for any new Issuer.
- Backend certificate rotation now requires shipping an app update with the new pinned certificate(s) before the rotation takes effect in production, or connectivity to the backend breaks. This operational coupling is the real cost of this decision and must be planned into any future backend TLS certificate rotation.
- The host-match check (`url.hostname === backendHost`) is what keeps pinning from leaking onto Issuer HTTPS calls that happen to pass through the same overridden `globalThis.fetch` — removing or loosening that check would silently break issuance against any Issuer whose certificate doesn't match the pinned backend certificate.
- Local/LAN development against the plain-HTTP backend (`http://<windows-lan-ip>:4000`) is unaffected: pinning only activates for `https:` targets.
