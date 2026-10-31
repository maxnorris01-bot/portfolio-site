import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { createShopClient, type ShopClient } from './api.ts'
import { ShopController } from './controller.ts'

const defaultClient = createShopClient()

/** The Shop page's state and actions: a ShopController, subscribed to. */
export function useShopSearch(client: ShopClient = defaultClient) {
  const controller = useMemo(() => new ShopController(client), [client])
  const state = useSyncExternalStore(controller.subscribe, controller.getState)
  useEffect(() => {
    void controller.restore()
    return controller.dispose
  }, [controller])
  const { search, retry, shopAgain, rate, setComment, commentBlur, retryRating, removeRefine, removeContext } = controller
  return { state, search, retry, shopAgain, rate, setComment, commentBlur, retryRating, removeRefine, removeContext }
}
