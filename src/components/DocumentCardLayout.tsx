/** Shared banner/hero/two-column layout shell for document cards. */

import type { ReactNode } from 'react'
import { View } from 'react-native'

import { THEME } from '../config/themeColors'

type DocumentCardLayoutProps = Readonly<{
  primaryColor: string
  banner: ReactNode
  bannerAction?: ReactNode
  hero: ReactNode
  leftColumn: ReactNode
  rightColumn: ReactNode
  columnsClassName?: string
  testID?: string
}>

const DEFAULT_COLUMNS_CLASS_NAME = 'flex-row px-4 py-4'

export function DocumentCardLayout({
  primaryColor,
  banner,
  bannerAction,
  hero,
  leftColumn,
  rightColumn,
  columnsClassName,
  testID = 'document-card-layout',
}: DocumentCardLayoutProps) {
  return (
    <View
      testID={testID}
      className="rounded-2xl bg-white"
      style={{
        elevation: 4,
        shadowColor: THEME.navyShadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      }}>
      <View
        testID="document-card-banner"
        className="min-h-12 w-full flex-row items-center rounded-t-2xl px-4 py-3"
        style={{ width: '100%', backgroundColor: primaryColor }}>
        <View
          testID="document-card-banner-primary"
          className="min-w-0 flex-1 justify-center"
          style={{ backgroundColor: primaryColor }}>
          {banner}
        </View>
        {bannerAction ? (
          <View testID="document-card-banner-action" className="ml-2 shrink-0">
            {bannerAction}
          </View>
        ) : null}
      </View>

      <View testID="document-card-hero" className="border-b border-surface-blue px-4 py-4">
        {hero}
      </View>

      <View
        testID="document-card-columns"
        className={columnsClassName ?? DEFAULT_COLUMNS_CLASS_NAME}
      >
        <View testID="document-card-left-column" className="flex-1 pr-4">
          {leftColumn}
        </View>
        <View testID="document-card-divider" className="w-px bg-surface-edge" />
        <View testID="document-card-right-column" className="flex-1 pl-4">
          {rightColumn}
        </View>
      </View>
    </View>
  )
}
