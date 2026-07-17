# Production Configuration Hardening Design

## Scope

Harden deployment configuration by removing unsafe production fallbacks for mobile and server endpoints, secrets, ports, database settings, and enabled external services.

This design does not change protocol flows, credential formats, storage behavior, or UI behavior. Protocol-required constants such as NFC AIDs, companion audiences, cryptographic sizes, algorithm identifiers, HTTP status semantics, and internal storage keys remain code constants.

## Goals

- Prevent release builds from silently using localhost, loopback, HTTP, customer development URLs, or placeholder secrets.
- Keep local development and automated tests convenient through explicit development/test defaults.
- Centralize configuration parsing and validation so components and protocol services do not read deployment endpoints directly.
- Provide clear, redacted startup errors when production configuration is missing or unsafe.
- Document required variables and their development defaults in environment templates.

## Configuration boundaries

### Mobile

Mobile endpoint and policy readers under `src/config/` are the only source of runtime deployment configuration. Consumers receive resolved values from these readers rather than reading environment variables directly.

Development may use localhost or documented test endpoints. Release-like builds must require valid HTTPS values for the Wallet API and Broker endpoints, and must reject missing, malformed, loopback, or placeholder values.

### Server

`server/src/config.ts` remains the single parsing and validation boundary for server configuration. It may provide local development and test defaults, but production must explicitly configure:

- JWT secret
- Database host, port, name, user, and password
- Wallet API allowed origins
- Session and token policy values
- Mail settings when mail delivery is enabled
- Issuer, Broker, and Verifier service URLs for enabled flows

Production validation must reject placeholder secrets, localhost or loopback service/database values where prohibited, development mail addresses, invalid ports, malformed URLs, and insecure HTTP endpoints where HTTPS is required.

Startup errors identify the configuration key and validation reason only. They must never include secret values, passwords, tokens, or full sensitive connection strings.

## Runtime rules

- Mobile release builds require HTTPS for Wallet API and Broker URLs.
- Production server startup rejects `local-dev-change-me` and equivalent placeholder values.
- Production configuration must not silently fall back to localhost, loopback database settings, development mail addresses, or customer development endpoints.
- Test environments may use deterministic fixtures and mocked endpoints.
- Development defaults remain available only when the runtime is explicitly development or test.
- Timing and size policies continue to use environment-backed readers with documented defaults; their migration is a separate implementation slice from endpoint validation.

## Implementation slices

1. Centralize and validate mobile endpoint configuration.
2. Harden server configuration validation.
3. Add or update `.env.example` and `server/.env.example` with units, defaults, and effects.
4. Update `docs/TASKS.md` with the completed implementation slice and remaining follow-up work.

## Testing

Each configuration group will cover:

- Development defaults
- Explicit environment overrides
- Missing required production values
- HTTP and loopback production URLs
- Placeholder secrets
- Invalid ports and malformed URLs
- Redacted startup errors

Verification for each slice includes focused tests, `yarn tsc --noEmit`, and `yarn lint`. Release-like startup checks must demonstrate rejection of unsafe configuration, while development startup must continue to work.

## Non-goals

- Refactoring credential types or UI/domain configuration
- Changing protocol constants or wire compatibility
- Replacing certificate pinning behavior
- Changing database schema or API contracts
- Migrating every hardcoded timeout in the same implementation slice
