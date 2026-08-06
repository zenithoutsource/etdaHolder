import { useFocusEffect } from 'expo-router'
import { useCallback, useRef } from 'react'
import { BackHandler, Platform } from 'react-native'

/**
 * Handles Android system Back for a flow screen without exposing stale
 * intermediate routes underneath the flow.
 */
export function useAndroidBackNavigation(onBack: () => void): () => void {
  const isExitingRef = useRef(false)
  const guardedOnBack = useCallback(() => {
    if (isExitingRef.current) return

    isExitingRef.current = true
    onBack()
  }, [onBack])

  useFocusEffect(
    useCallback(() => {
      isExitingRef.current = false
      if (Platform.OS === 'web') return undefined

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        guardedOnBack()
        return true
      })

      return () => {
        subscription.remove()
        isExitingRef.current = false
      }
    }, [guardedOnBack]),
  )

  return guardedOnBack
}
