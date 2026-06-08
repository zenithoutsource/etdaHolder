# Security Findings

Security review history for the ETDA Wallet. Actionable remediation work remains tracked in `docs/TASKS.md`.

## 2026-06-04 Auth and Crypto Review

Resolved items:

- Startup asserts hardware secure environment availability.
- Production software signing fallback was removed.
- Android production MMKV key storage uses hardware-backed Keychain constraints where available.
- Startup security errors are mapped to user-facing messages.

## 2026-06-08 Review of `5bd028e`

Scope: local review of the current `dev` branch via code-review, security-review, and silent-failure perspectives.

Summary:

- Critical findings: 0.
- Important UI-correctness findings: 1.
- Important hardening and robustness findings: 5.
- Advisory findings: claim-reading dedupe, swallowed-error logging, and local-backend auth oracle cleanup.

Status:

- Important release-blocking remediation checkboxes are complete in `docs/TASKS.md` under Phase 4.1.
- Remaining advisory cleanup includes registration email enumeration and broader swallowed-error logging.
- No evidence was found of SQL injection through reviewed routes, IDOR in credential ownership checks, committed secrets, leaked raw signing keys, or remaining production software-signing fallback.
