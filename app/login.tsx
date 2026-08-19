/**
 * Legacy login path — redirects to /auth.
 * Map: docs/CODEMAPS/frontend.md#auth-and-pin
 */

import { Redirect } from 'expo-router'

export default function LoginScreen() {
  return <Redirect href="/auth" />
}
