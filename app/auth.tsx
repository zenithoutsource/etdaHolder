/**
 * Auth entry — login/register wizard.
 * Journey: Auth and PIN.
 * Layout: AuthWizard.
 * Next: pin-setup or tabs.
 * Map: docs/CODEMAPS/frontend.md#auth-and-pin
 */

import { AuthWizard } from '../src/components/auth/AuthWizard'

export default function AuthScreen() {
  return <AuthWizard />
}
