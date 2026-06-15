# AppButton

Reusable button component (`src/components/AppButton.tsx`). Use for all tappable buttons — replaces ad-hoc `Pressable`/`TouchableOpacity`. NativeWind `className` only.

## Variants

| Variant | Look | Use for |
|---|---|---|
| `outline-primary` (default) | small rounded-full, navy border/text | secondary pill action |
| `outline-danger` | small rounded-full, red border/text | destructive pill action (e.g. ลบรายการ) |
| `solid-primary` | small rounded-full, navy bg, white text | primary pill action |
| `solid-block` | rounded-full, navy bg, white bold text, larger | primary CTA (Sign In, Continue, ขอเอกสาร) |
| `outline-block` | rounded-full, white bg, navy border/text | secondary CTA |
| `icon-circle` | circular, icon only, no label | back arrow, "..." menu, close |

## Props

| Prop | Type | Notes |
|---|---|---|
| `label` | `string?` | omit for icon-only buttons |
| `onPress` | `() => void` | |
| `variant` | `AppButtonVariant` | default `outline-primary` |
| `icon` | `ImageSourcePropType` | custom image icon |
| `iconName` | MaterialCommunityIcons name | vector icon |
| `iconSize` | `number` | default `14` |
| `iconColor` | `string` | override variant's default icon color |
| `fullWidth` | `boolean` | adds `w-full` |
| `loading` | `boolean` | shows `ActivityIndicator` instead of label, auto-disables |
| `disabled` | `boolean` | auto `opacity-50` unless `className` already sets `opacity-*` |
| `className` / `textClassName` | `string` | append/override container/text styles for one-off sizing/colors |
| `accessibilityLabel` / `accessibilityRole` | `string` / `'button' \| 'none'` | a11y, mainly for icon-only buttons |

## Examples

```tsx
// Small danger pill (delete row action)
<AppButton variant="outline-danger" label="ลบรายการ" icon={trashCanImage} className="mt-3" />

// Primary CTA with loading state
<AppButton
  variant="solid-block"
  label="Sign In"
  loading={isLoading}
  disabled={isLoading}
  className="rounded-xl bg-wallet-navy py-[14px]"
  textClassName="text-[15px] font-semibold"
  onPress={handleLogin}
/>

// Icon-only circular back button
<AppButton
  variant="icon-circle"
  iconName="chevron-left"
  iconColor="#ffffff"
  className="h-9 w-9 border border-white"
  onPress={onBack}
  accessibilityLabel="Back"
/>
```

## When NOT to use

One-off layouts that don't fit the flex-row icon+label shape (e.g. multi-line/column buttons with shadows, mixed bold/normal inline text links) — keep those as plain `Pressable` rather than forcing a variant.
