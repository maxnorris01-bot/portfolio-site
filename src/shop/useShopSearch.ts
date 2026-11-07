import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { createShopClient, type ShopClient } from './api.ts'
import { ShopController } from './controller.ts'

const defaultClient = createShopClient()

/** The Shop page's state and actions: a ShopController, subscribed to. */
export function useShopSearch(client: ShopClient = defaultClient) {
  const controller = useMemo(() => new ShopController(client), [client])
  const state = useSyncExternalStore(controller.subscribe, controller.getState)
  const meta = useSyncExternalStore(controller.subscribe, controller.getMeta)
  useEffect(() => {
    void controller.restore()
    void controller.loadUsage()
    return controller.dispose
  }, [controller])
  const { search, retry, shopAgain, saveFilters, searchAgain, rate, setComment, commentBlur, retryRating, removeRefine, removeContext, resolveLink, selectAnswer, submitAnswers, retryAnswers, touch } = controller
  return { state, meta, resolveLink, search, retry, shopAgain, saveFilters, searchAgain, rate, setComment, commentBlur, retryRating, removeRefine, removeContext, selectAnswer, submitAnswers, retryAnswers, touch }
}
