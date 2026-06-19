import { markCredentialAsNew as defaultMarkCredentialAsNew } from './credentialBadges'
import {
  saveCredentialRecord as defaultSaveCredentialRecord,
  type VerifiableCredentialRecord,
} from '../vci/exchangeService'

type SaveScannedCredentialDependencies = {
  saveCredentialRecord?: (record: VerifiableCredentialRecord) => void
  markCredentialAsNew?: (credentialId: string) => void
  refreshCredentials?: () => void
}

export function saveScannedCredential(
  record: VerifiableCredentialRecord,
  dependencies: SaveScannedCredentialDependencies = {},
): void {
  const saveCredentialRecord = dependencies.saveCredentialRecord ?? defaultSaveCredentialRecord
  const markCredentialAsNew = dependencies.markCredentialAsNew ?? defaultMarkCredentialAsNew

  saveCredentialRecord(record)
  markCredentialAsNew(record.id)
  dependencies.refreshCredentials?.()
}
