# Document Card Unification Design

**Status:** Approved design

## Goal

Restore the full-width driving-licence banner, restore the Revoke/Delete
credential actions when policy permits them, and give ID Card and Transcript
the same document-card visual language as Driving License.

## Visual design

All three wallet detail cards and their receive previews will use the same
visual structure:

- white rounded card with the existing elevation/shadow treatment;
- full-width colored document banner with title text;
- portrait/name/date-of-birth hero row;
- lower two-column detail area with a vertical divider;
- consistent label/value typography and spacing;
- expiry values use the existing red warning treatment.

The banner will use normal full-width flex children rather than an absolute
overlay, preventing the secondary color panel from leaving uncovered space.

Driving License keeps its approved fixed demo copy and
`assets/images/user_profile.png`. ID Card and Transcript retain their
existing dynamic claim/profile values, issuer-specific title/colors, and
document fields while adopting the shared layout.

## Component boundaries

Extract shared card geometry and styling into focused reusable components or
helpers under `src/components/`. Document-specific components provide only
their title, colors, portrait, hero values, and detail rows. Existing
`DocumentCardShell`, lifecycle overlays, QR/NFC action row, and receive-flow
callbacks remain outside the visual card content.

The wallet detail route and VC receive route will select the appropriate
document presentation by credential type. No protocol, storage, SDK, or
native behavior changes are included.

## Revoke/Delete policy

`shouldHideCredentialActionMenu()` will no longer hide Revoke/Delete merely
because any renewal record exists. Actions remain hidden while wallet key
rotation or a visible renewal/inactive ribbon policy requires it; otherwise
the credential detail screen renders both actions. Existing lifecycle rules
for renewal-required, renewal-processing, revoked, cleanup-pending, and
expired states remain authoritative through the current ribbon context.

## Verification

Add focused tests for:

- full-width banner structure on Driving License, ID Card, and Transcript;
- shared card geometry and document-specific values;
- ID Card and Transcript receive-preview rendering;
- Revoke/Delete action-menu visibility with and without a renewal record;
- preservation of existing lifecycle, QR/NFC, and accept callbacks.

Run focused tests, `yarn tsc --noEmit`, and `yarn lint`. Record results in
`docs/TASKS.md`.
