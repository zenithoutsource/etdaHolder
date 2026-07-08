import { CameraView } from 'expo-camera'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Text, View } from 'react-native'

import { AppButton } from './AppButton'

import { THEME } from '../config/themeColors'

type ScanCaptureSurfaceProps = {
  isLoading: boolean
  loadingLabel: string
  onBarcode: (data: string) => void
  onNfcPress: () => void
  onCancel: () => void
}

export function ScanCaptureSurface({
  isLoading,
  loadingLabel,
  onBarcode,
  onNfcPress,
  onCancel,
}: ScanCaptureSurfaceProps) {
  const [viewfinderHeight, setViewfinderHeight] = useState(0)
  const scanLineAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(scanLineAnim, { toValue: 0, duration: 2000, useNativeDriver: false }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [scanLineAnim])

  return (
    <View className="relative flex-1 items-center">
      <CameraView
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={isLoading ? undefined : ({ data }) => onBarcode(data)}
      />
      <View className="w-full items-center bg-black/25 px-4 pb-10 pt-16">
        <Text className="text-3xl font-bold text-blue-700">{loadingLabel}</Text>
      </View>

      <View
        className="w-full max-w-[310px] overflow-hidden rounded-[18px]"
        style={{ aspectRatio: 1 }}
        onLayout={(event) => setViewfinderHeight(event.nativeEvent.layout.height)}
      >
        <View style={{ position: 'absolute', top: 14, left: 14, width: 36, height: 36, borderTopWidth: 3.5, borderLeftWidth: 3.5, borderColor: 'white', borderTopLeftRadius: 12 }} />
        <View style={{ position: 'absolute', top: 14, right: 14, width: 36, height: 36, borderTopWidth: 3.5, borderRightWidth: 3.5, borderColor: 'white', borderTopRightRadius: 12 }} />
        <View style={{ position: 'absolute', bottom: 14, left: 14, width: 36, height: 36, borderBottomWidth: 3.5, borderLeftWidth: 3.5, borderColor: 'white', borderBottomLeftRadius: 12 }} />
        <View style={{ position: 'absolute', bottom: 14, right: 14, width: 36, height: 36, borderBottomWidth: 3.5, borderRightWidth: 3.5, borderColor: 'white', borderBottomRightRadius: 12 }} />

        {!isLoading && viewfinderHeight > 0 ? (
          <Animated.View
            style={{
              position: 'absolute',
              left: 14,
              right: 14,
              height: 2,
              borderRadius: 2,
              backgroundColor: 'rgba(0,40,135,0.55)',
              shadowColor: 'rgba(0,40,135,1)',
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: 8,
              shadowOpacity: 0.35,
              top: scanLineAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [
                  Math.round(viewfinderHeight * 0.1),
                  Math.round(viewfinderHeight * 0.88),
                ],
              }),
            }}
          />
        ) : null}

        {isLoading ? (
          <View className="absolute inset-0 items-center justify-center bg-black/25">
            <ActivityIndicator size="large" color={THEME.white} />
          </View>
        ) : null}
      </View>

      <View className="w-full flex-1 items-center bg-black/25 px-4 pt-10">
        {isLoading ? (
          <AppButton
            variant="icon-circle"
            label="Cancel"
            onPress={onCancel}
            className="bg-white/20 px-6 py-2"
            textClassName="text-[14px] font-semibold text-white"
          />
        ) : (
          <AppButton
            variant="solid-block"
            label="Use NFC"
            onPress={onNfcPress}
            className="rounded-xl bg-white/20 px-5 py-3"
            textClassName="text-[14px] font-semibold text-white"
          />
        )}
      </View>
    </View>
  )
}
