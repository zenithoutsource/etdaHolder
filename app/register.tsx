/**
 * Legacy register path — redirects to /auth.
 * Map: docs/CODEMAPS/frontend.md#auth-and-pin
 */

import { Redirect } from 'expo-router'

export default function RegisterScreen() {
  return <Redirect href="/auth" />
}
