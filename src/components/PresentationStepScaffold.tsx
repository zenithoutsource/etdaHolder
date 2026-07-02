import type { ReactNode } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'

import { WalletHeader } from './WalletHeader'

type PresentationStepScaffoldProps = {
  children: ReactNode
  title?: string
  onBack: () => void
}

export function PresentationStepScaffold({
  children,
  title,
  onBack,
}: PresentationStepScaffoldProps) {
  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
      <WalletHeader title={title} onBack={onBack} />
      {children}
    </SafeAreaView>
  )
}
