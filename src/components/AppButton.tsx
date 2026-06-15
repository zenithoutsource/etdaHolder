import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ActivityIndicator, Image, Pressable, Text, type ImageSourcePropType } from 'react-native';

type MaterialIconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * ## Usage
 * Variants:
 * - `outline-danger` / `outline-primary` / `solid-primary`: small rounded-full badge buttons (px-3 py-1.5, 11px text).
 * - `solid-block`: full-width-ish solid button, rounded-xl, centered text (e.g. primary CTAs like "Sign In"). Pair with
 *   `fullWidth` and `className` overrides for height/padding/colors that differ per screen.
 * - `outline-block`: outline version of solid-block.
 * - `icon-circle`: circular icon-only button (no label), e.g. back arrow, "..." menu.
 *
 * Props: `label` (optional - omit for icon-only), `icon`/`iconName`/`iconSize`/`iconColor`, `fullWidth`, `loading`
 * (shows ActivityIndicator instead of label), `disabled`, `className`/`textClassName` overrides,
 * `accessibilityLabel`/`accessibilityRole`.
 *
 * Examples:
 * ```tsx
 * <AppButton variant="solid-primary" label="ลบ" iconName="trash-can-outline" onPress={onDelete} />
 * <AppButton variant="solid-block" label="Sign In" loading={isLoading} disabled={isLoading}
 *   className="rounded-xl bg-wallet-navy py-[14px]" textClassName="text-[15px] font-semibold" onPress={handleLogin} />
 * <AppButton variant="icon-circle" iconName="chevron-left" iconColor="#ffffff"
 *   className="h-9 w-9 border border-white" onPress={onBack} accessibilityLabel="Back" />
 * ```
 */

type AppButtonVariant = 'outline-danger' | 'outline-primary' | 'solid-primary' | 'solid-block' | 'outline-block' | 'icon-circle';

const variantStyles: Record<AppButtonVariant, { container: string; text: string; iconColor: string }> = {
  'outline-danger': {
    container: 'self-start rounded-full border border-[#d12d2d] px-3 py-1.5',
    text: 'text-[11px] font-semibold text-[#c00000]',
    iconColor: '#c00000',
  },
  'outline-primary': {
    container: 'self-start rounded-full border border-wallet-navy px-3 py-1.5',
    text: 'text-[11px] font-semibold text-wallet-navy',
    iconColor: '#002887',
  },
  'solid-primary': {
    container: 'self-start rounded-full bg-wallet-navy px-3 py-1.5',
    text: 'text-[11px] font-semibold text-white',
    iconColor: '#ffffff',
  },
  'solid-block': {
    container: 'items-center justify-center rounded-full bg-wallet-navy',
    text: 'text-[15px] font-extrabold text-white',
    iconColor: '#ffffff',
  },
  'outline-block': {
    container: 'items-center justify-center rounded-full border border-wallet-navy bg-white',
    text: 'text-[15px] font-extrabold text-wallet-navy',
    iconColor: '#002887',
  },
  'icon-circle': {
    container: 'items-center justify-center rounded-full',
    text: '',
    iconColor: '#002887',
  },
};

type AppButtonProps = {
  label?: string;
  onPress?: () => void;
  variant?: AppButtonVariant;
  icon?: ImageSourcePropType;
  iconName?: MaterialIconName;
  iconSize?: number;
  iconColor?: string;
  fullWidth?: boolean;
  loading?: boolean;
  className?: string;
  textClassName?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'none';
};

export function AppButton({
  label,
  onPress,
  variant = 'outline-primary',
  icon,
  iconName,
  iconSize = 14,
  iconColor,
  fullWidth,
  loading,
  className,
  textClassName,
  disabled,
  accessibilityLabel,
  accessibilityRole,
}: AppButtonProps) {
  const styles = variantStyles[variant];
  const resolvedIconColor = iconColor ?? styles.iconColor;
  const hasOpacityOverride = className?.includes('opacity-') ?? false;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      className={`flex-row items-center gap-1.5 ${styles.container}${fullWidth ? ' w-full' : ''}${className ? ` ${className}` : ''}${disabled && !hasOpacityOverride ? ' opacity-50' : ''}`}>
      {loading ? (
        <ActivityIndicator color={variant === 'outline-primary' || variant === 'outline-block' ? resolvedIconColor : '#fff'} />
      ) : (
        <>
          {icon ? <Image source={icon} className="h-5 w-5" resizeMode="contain" /> : null}
          {iconName ? <MaterialCommunityIcons name={iconName} size={iconSize} color={resolvedIconColor} /> : null}
          {label ? <Text className={`${styles.text}${textClassName ? ` ${textClassName}` : ''}`}>{label}</Text> : null}
        </>
      )}
    </Pressable>
  );
}
