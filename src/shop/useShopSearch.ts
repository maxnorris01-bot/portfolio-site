import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { ShopError, createShopClient, isAbort, type ShopClient } from './api.ts'
import { JobPoller } from './poller.ts'
import { initialState, readSavedSession, saveSession, shopReducer } from './state.ts'

const defaultClient = createShopClient()

/** The page's search: start, poll, show, restore after a refresh. */
export function useShopSearch(client: ShopClient = defaultClient) {
  const [state, dispatch] = useReducer(shopReducer, initialState)
  const poller = useMemo(() => new JobPoller(client), [client])
  const session = useRef<string | null>(null)
  const last = useRef('')
  const starting = useRef<AbortController | null>(null)

  const fail = useCallback((e: unknown) => {
    if (isAbort(e)) return
    const err = e instanceof ShopError ? e : new ShopError('server_error', 'Something went wrong. Please try again.')
    dispatch({ type: 'fail', message: err.message, retryAfterS: err.retryAfterS })
  }, [])

  const search = useCallback(
    async (text: string) => {
      const request = text.trim()
      if (!request) return
      last.current = request
      poller.stop()
      starting.current?.abort()
      const controller = new AbortController()
      starting.current = controller
      dispatch({ type: 'submit', request, now: Date.now() })
      try {
        const { job_id } = await client.startSearch(session.current, request, controller.signal)
        poller.start(job_id, session.current, {
          onProgress: (job) => dispatch({ type: 'progress', job }),
          onSlow: () => dispatch({ type: 'slow' }),
          onDone: (view) => {
            session.current = view.session_id ?? session.current
            saveSession(session.current)
            dispatch({ type: 'done', view })
          },
          onError: fail,
        })
      } catch (e) {
        fail(e)
      }
    },
    [client, poller, fail],
  )

  const retry = useCallback(() => void search(last.current), [search])

  useEffect(() => {
    const saved = readSavedSession()
    const controller = new AbortController()
    if (saved) {
      session.current = saved
      dispatch({ type: 'restoring' })
      client
        .loadSession(saved, controller.signal)
        .then((view) => dispatch({ type: 'restored', view }))
        .catch((e) => {
          if (isAbort(e)) return
          session.current = null
          saveSession(null)
          dispatch({ type: 'restored', view: null })
        })
    }
    return () => {
      controller.abort()
      starting.current?.abort()
      poller.stop()
    }
  }, [client, poller])

  return { state, search, retry }
}
