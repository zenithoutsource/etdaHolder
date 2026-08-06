import type { ReactNode } from 'react'
import { View } from 'react-native'

import { THEME } from '../config/themeColors'

type DocumentCardLayoutProps = Readonly<{
  primaryColor: string
  banner: ReactNode
  hero: ReactNode
  leftColumn: ReactNode
  rightColumn: ReactNode
  testID?: string
}>

export function DocumentCardLayout({
  primaryColor,
  banner,
  hero,
  leftColumn,
  rightColumn,
  testID = 'document-card-layout',
}: DocumentCardLayoutProps) {
  return (
    <View
      testID={testID}
      className="overflow-hidden rounded-2xl bg-white"
      style={{
        elevation: 4,
        shadowColor: THEME.navyShadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      }}>
      <View
        testID="document-card-banner"
        className="min-h-12 w-full flex-row overflow-hidden"
        style={{ width: '100%', backgroundColor: primaryColor }}>
        <View testID="document-card-banner-primary" className="w-full flex-1 justify-center px-4 py-3" style={{ backgroundColor: primaryColor }}>
          {banner}
        </View>
      </View>

      <View testID="document-card-hero" className="border-b border-surface-blue px-4 py-4">
        {hero}
      </View>

      <View className="flex-row px-4 py-4">
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
