# Driving Licence Card Design

**Status:** Approved design

## Goal

Reproduce the supplied driving-licence reference card as the wallet's visual
representation for the driving-licence credential and reuse the same
representation in the VC receive confirmation flow.

## Fixed reference content

The first slice intentionally uses the sample values shown in the reference:

- Header: `DRIVING LICENSE`
- Thai name: `นางสาว พิชญา รุ่งเรืองกิต`
- English name: `Ms. Pichaya Rungruangkit`
- Date of birth: `15 พฤษภาคม 2530`
- Type: `รถยนต์ส่วนบุคคล` / `Private Motor Car`
- Licence number: `54002891`
- Issue date: `20 มกราคม 2565`
- Expiry date: `20 มกราคม 2570`

The portrait is `assets/images/user_profile.png`.

## Architecture

Add a focused driving-licence document-card component under
`src/components/`, using the existing card shell and action boundaries. Keep
the generic `CredentialCard` and schema registry intact for other credential
types. The driving-licence component owns only the reference-specific visual
layout: blue header band, portrait/name/date-of-birth hero, two-column lower
section, vertical divider, and red expiry treatment.

Create one shared sample display model so the wallet detail/home card and the
VC receive confirmation panel cannot drift apart. The receive flow will select
this presentation for `DLTDrivingLicence` and render it before the save action.
The sample presentation is deliberately fixed for this demo slice; no new
credential parsing or storage behavior is introduced.

## Interaction and boundaries

Existing credential actions, lifecycle badges, and save callbacks remain
outside the card's visual content. The card is presentational and prop-driven
where the surrounding flow already supplies callbacks. The image uses the
existing local asset and React Native image primitive/pattern.

## Verification

Add focused component coverage for:

- exact title and sample values;
- the local portrait asset;
- the two-column/divider and expiry presentation markers;
- rendering the same driving-licence presentation in the VC receive flow.

Run the focused tests, `yarn tsc --noEmit`, and `yarn lint` after
implementation. Update `docs/TASKS.md` with the completed slice.
