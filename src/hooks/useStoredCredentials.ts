import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'

import { getCredentialStorage } from '../services/storage/storage'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

type UseStoredCredentialsResult = {
  credentials: VerifiableCredentialRecord[]
  error: string | null
  refresh: () => void
}

function readCredentialsFromStorage(): VerifiableCredentialRecord[] {
  const storage = getCredentialStorage()
  const indexRaw = storage.getString('credential:index')
  const ids: string[] = indexRaw ? (JSON.parse(indexRaw) as string[]) : []
  return ids
    .map((id) => storage.getString(`credential:${id}`))
    .filter((raw): raw is string => raw !== undefined)
    .map((raw) => JSON.parse(raw) as VerifiableCredentialRecord)
}

function isStorageNotInitialized(error: unknown): boolean {
  return error instanceof Error && error.message === 'StorageNotInitialized'
}

export function useStoredCredentials(): UseStoredCredentialsResult {
  const [credentials, setCredentials] = useState<VerifiableCredentialRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    try {
      setCredentials(readCredentialsFromStorage())
      setError(null)
    } catch (err) {
      if (isStorageNotInitialized(err)) {
        setCredentials([])
        setError(null)
        return
      }

      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useFocusEffect(refresh)

  return { credentials, error, refresh }
}
