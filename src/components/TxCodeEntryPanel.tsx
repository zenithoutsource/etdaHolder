/**
 * OID4VCI transaction-code entry before DOPA confirm or credential acquire.
 * Journey: P1 Scan / credential-offer claim pipeline.
 * Copy: inline Thai — enter the code shown on the verifier screen.
 * Layout: WalletHeader stays on the claim screen; this panel fills the body.
 * Next: DOPA confirm (PID) or acquire / preview.
 * Map: docs/CODEMAPS/frontend.md#scan-and-issuance
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useEffect, useRef, useState } from 'react'
import {
  Keyboard,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'

import type { TxCode } from '../services/vci/walletVciTypes'
import { normalizeNumericCode } from '../utils/normalizeNumericCode'
import { THEME } from '../config/themeColors'
import { AppButton } from './AppButton'
import { CodeBoxField } from './auth/CodeBoxField'

const TITLE = 'กรอกรหัสยืนยัน'
const BODY = 'กรอกรหัสที่อยู่บนหน้าจอของผู้ตรวจสอบ'
const NOTE = 'ดูรหัสบนหน้าจอของผู้ตรวจสอบ แล้วพิมพ์ลงในช่องด้านล่าง'
const CONTINUE_LABEL = 'ดำเนินการต่อ'
const PLACEHOLDER = 'กรอกรหัส'

type TxCodeEntryPanelProps = {
  value: string
  onChange: (code: string) => void
  onContinue: () => void
  txCode?: TxCode
}

export function TxCodeEntryPanel({
  value,
  onChange,
  onContinue,
  txCode,
}: TxCodeEntryPanelProps) {
  const isNumeric = txCode?.input_mode === 'numeric'
  const maxLength = txCode?.length
  const useCodeBoxes = isNumeric && maxLength === 6
  const canContinue = value.trim().length > 0
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height)
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true })
      })
    })
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0)
    })
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  function handleChange(text: string) {
    if (isNumeric) {
      onChange(normalizeNumericCode(text, maxLength ?? 32))
      return
    }
    onChange(text)
  }

  return (
    <View testID="tx-code-entry-panel" className="flex-1 bg-wallet-bg">
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="grow justify-center px-5 py-8"
        contentContainerStyle={{ paddingBottom: Math.max(keyboardHeight, 32) }}
      >
        <View className="items-center rounded-[24px] bg-white px-6 py-8">
          <View className="h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-navy-muted">
            <MaterialCommunityIcons name="monitor-screenshot" size={36} color={THEME.white} />
          </View>

          <Text className="mt-6 text-center text-[22px] font-extrabold text-navy-deep">{TITLE}</Text>
          <Text className="mt-2 text-center text-[13px] leading-6 text-gray500">{BODY}</Text>

          <View className="mt-6 w-full">
            {useCodeBoxes ? (
              <CodeBoxField
                value={value}
                onChange={handleChange}
                length={6}
                testID="tx-code-boxes"
              />
            ) : (
              <TextInput
                testID="tx-code-input"
                value={value}
                onChangeText={handleChange}
                keyboardType={isNumeric ? 'number-pad' : 'default'}
                textContentType={isNumeric ? 'oneTimeCode' : 'none'}
                autoComplete={isNumeric ? 'one-time-code' : 'off'}
                maxLength={maxLength}
                placeholder={PLACEHOLDER}
                placeholderTextColor={THEME.grayCool}
                className="min-h-[48px] rounded-[10px] border border-surface-edge px-4 text-center text-[18px] font-semibold text-navy-deep"
              />
            )}
          </View>

          <View className="mt-5 w-full flex-row items-center gap-2 rounded-xl bg-surface-soft px-4 py-3">
            <MaterialCommunityIcons name="information-outline" size={18} color={THEME.navyDeep} />
            <Text className="flex-1 text-[12px] leading-5 text-gray500">{NOTE}</Text>
          </View>

          <AppButton
            testID="tx-code-continue"
            variant="solid-block"
            label={CONTINUE_LABEL}
            onPress={onContinue}
            disabled={!canContinue}
            fullWidth
            className={`mt-8 py-4 ${!canContinue ? 'opacity-45' : ''}`}
            accessibilityLabel={CONTINUE_LABEL}
          />
        </View>
      </ScrollView>
    </View>
  )
}
