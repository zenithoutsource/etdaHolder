import { CommonActions } from '@react-navigation/native'
import { useNavigation, type Router } from 'expo-router'
import { useCallback } from 'react'

type WalletRouter = Pick<Router, 'dismissTo'>

/**
 * Resets the root stack to the Wallet tab so transient flow routes cannot
 * reappear when Android Back is pressed after the flow exits.
 */
export function useReturnToWallet(router: WalletRouter): () => void {
  const navigation = useNavigation()

  return useCallback(() => {
    const rootNavigation = navigation.getParent()
    if (rootNavigation) {
      rootNavigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: '(tabs)' }],
        }),
      )
      return
    }

    router.dismissTo('/(tabs)')
  }, [navigation, router])
}
