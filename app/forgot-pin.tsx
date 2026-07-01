import { useLocalSearchParams, useRouter } from 'expo-router'

import { ForgotPinFlow } from '@/src/components/auth/ForgotPinFlow'
import { useAuthStore } from '@/src/store/authStore'

export default function ForgotPinScreen() {
  const router = useRouter()
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>()
  const logout = useAuthStore((s) => s.logout)

  const prefilledEmail = typeof emailParam === 'string' ? emailParam : ''

  return (
    <ForgotPinFlow
      prefilledEmail={prefilledEmail}
      onBack={() => router.back()}
      onComplete={async () => {
        await logout()
        router.replace('/auth')
      }}
    />
  )
}
