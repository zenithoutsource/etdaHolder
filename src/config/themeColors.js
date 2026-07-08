/**
 * Single source of truth for every color in the app.
 *
 * - Tailwind/NativeWind classes (bg-*, text-*, border-*, shadow-*) resolve from
 *   `tailwindColors` via tailwind.config.js — e.g. `bg-danger`, `text-ink`.
 * - Runtime color props (icon `color`, `shadowColor`, chart colors) import
 *   `THEME` — e.g. `color={THEME.slate}`.
 *
 * Adjust a value here and both usages update everywhere.
 */

const palette = {
  // Brand navy family
  navy: '#002887',
  navyButton: '#00247d',
  navyCard: '#002854',
  navyDeep: '#071f5f',
  navyRoyal: '#123b8c',
  navyMid: '#173a78',
  navyMuted: '#1a3a7a',
  navyShadow: '#0f2849',
  navyBlack: '#0a1432',
  navyAlt: '#003064',
  navyIndigo: '#001e6e',
  ink: '#1a2a42',
  inkGray: '#1f2937',

  // Blue-gray / slate text and lines
  slate: '#6d7a8d',
  blueGray: '#8a9bb0',
  grayCool: '#9aa1ad',
  slateMuted: '#6d7890',
  // "steel" scale = custom blue-gray ramp. Deliberately NOT named slate-* so it
  // never shadows Tailwind's default slate palette with different values.
  slate500: '#64748b', // identical to Tailwind slate-500
  steel600: '#5c6778',
  slate750: '#364152',
  steel800: '#314158',
  slate350: '#9aa6b6',
  steel300: '#b7c0cc',
  slate250: '#c7ced8',
  steel200: '#d0d7e2',
  slate150: '#d7dce5',
  slate140: '#d8dde8',
  slate130: '#d5dce8',
  slate120: '#d1d9e6',
  slate110: '#d9dde4',
  steel100: '#e3e7ee',
  blueMist: '#cdd6ec',
  blueTint: '#eef4ff',

  // Neutral grays
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  grayBadge: '#7a7a7a',
  grayPanel: '#e2e2e2',
  grayLight: '#e3e3e3',
  white: '#ffffff',

  // Surfaces
  walletBg: '#f0f3f8',
  surface: '#eef1f4',
  surfaceSoft: '#f4f6fa',
  surfaceBlue: '#eef2f8',
  surfaceEdge: '#e2e8f0',

  // Reds / pinks
  danger: '#c00000',
  dangerDark: '#b00000',
  dangerBright: '#ff1f1f',
  dangerSoft: '#d12d2d',
  dangerAlert: '#e53935',
  red600: '#dc2626',
  dangerTint: '#fff0f0',
  pinkDeep: '#cc0066',
  pink: '#f45b9a',

  // Greens
  success: '#18a05d',
  successAlt: '#19a957',
  successDark: '#0f8f4b',
  successDeep: '#118f4b',
  greenDark: '#1a8a3a',
  successTint: '#e8f8ef',
  successPale: '#b8e6cc',

  // Ambers / golds
  warning: '#d97706',
  gold: '#f2c230',
  goldDark: '#d09a00',
  amber800: '#9a3412',
  amberTint: '#fff7ed',
}

/** camelCase → kebab-case for Tailwind class token names. */
function toKebab(name) {
  return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

const tailwindColors = Object.fromEntries(
  Object.entries(palette).map(([name, value]) => [toKebab(name), value]),
)

// Preserve existing wallet-* class names (bg-wallet-navy, bg-wallet-bg, ...).
tailwindColors.wallet = {
  bg: palette.walletBg,
  navy: palette.navy,
  card: palette.navyCard,
  button: palette.navyButton,
}

module.exports = { THEME: palette, tailwindColors }
