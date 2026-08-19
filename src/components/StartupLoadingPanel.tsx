/**
 * Branded startup overlay: app logo and indeterminate loading bar.
 * Journey: App launch before PIN/storage gates and tabs.
 * Copy: inline English startup-failure title; message from RootLayout.
 * Layout: full-screen white; logo plus looping bar while loading.
 * Next: storage PIN, PIN migration, or ready Stack.
 * Map: docs/CODEMAPS/frontend.md#global-hosts
 */

import { useEffect, useRef } from 'react'
import { Animated, Easing, Image, Text, View } from 'react-native'

const APP_LOGO = require('../../assets/images/icon.png')
const BAR_WIDTH_PX = 180
const KNOB_WIDTH_PX = 64

type StartupLoadingPanelProps = Readonly<{
  status: 'loading' | 'error'
  message?: string
  onReady?: () => void
}>

export function StartupLoadingPanel({ status, message, onReady }: StartupLoadingPanelProps) {
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (status !== 'loading') {
      progress.stopAnimation()
      progress.setValue(0)
      return
    }

    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [progress, status])

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-KNOB_WIDTH_PX, BAR_WIDTH_PX],
  })

  return (
    <View
      testID="startup-loading-panel"
      className="absolute inset-0 flex-1 items-center justify-center bg-white p-6"
      onLayout={() => onReady?.()}
    >
      <Image
        testID="startup-loading-logo"
        source={APP_LOGO}
        className="h-[120px] w-[120px]"
        resizeMode="contain"
        accessibilityLabel="Document Wallet"
      />

      {status === 'loading' ? (
        <View
          testID="startup-loading-bar"
          className="mt-8 h-1.5 w-[180px] overflow-hidden rounded-full bg-blue-tint"
          accessibilityRole="progressbar"
          accessibilityLabel="Loading"
        >
          <Animated.View
            className="h-full w-16 rounded-full bg-navy"
            style={{ transform: [{ translateX }] }}
          />
        </View>
      ) : (
        <View className="mt-8 w-full max-w-[320px] gap-2">
          <Text className="text-center text-lg font-semibold text-navy-deep">Wallet startup failed</Text>
          {message ? <Text className="text-center text-gray500">{message}</Text> : null}
        </View>
      )}
    </View>
  )
}
