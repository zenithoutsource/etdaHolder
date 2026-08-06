# History Issuer Logo Design

**Status:** Approved

## Goal

Show the issuing organization’s supplied logo and issuer name in each History Log entry for the supported Thai ID, driving licence, and academic transcript credential types.

## Design

The existing card-schema registry is the source of truth for credential identity, logo selection, and the temporary issuer names for the three supported credential types. The configured names are Department of Provincial Administration, Department of Land Transport, and Chulalongkorn University. Issuer metadata is retained for unknown credential types, which can fall back to the credential JWT `iss` value.

The supported visual mapping is:

| Credential | Asset |
| --- | --- |
| Thai National ID | `assets/images/thaid.png` |
| Driving Licence | `assets/images/dltt.png` |
| Academic Transcript | `assets/images/chulalongkorn.png` |

## Validation

Focused tests verify all three asset mappings, issuer metadata propagation, JWT `iss` fallback, and the generic logo fallback. Root TypeScript, lint, and focused Jest checks run after the change.
