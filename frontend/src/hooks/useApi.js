import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Run an async API call, tracking loading and error state.
 *
 * `keepFrame` is the reason this isn't three useStates: while a refetch is in
 * flight the previous data is held so the charts can stay on screen at reduced
 * opacity instead of collapsing to a skeleton and jumping the layout when the
 * range filter changes.
 */
export function useApi(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  // Guards against a slow earlier request resolving after a faster later one
  // and overwriting it — real with a range filter the user can click quickly.
  const latest = useRef(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const call = useCallback(fn, deps)

  useEffect(() => {
    const ticket = ++latest.current
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))

    call()
      .then((data) => {
        if (!cancelled && ticket === latest.current) {
          setState({ data, error: null, loading: false })
        }
      })
      .catch((err) => {
        if (!cancelled && ticket === latest.current) {
          setState({ data: null, error: err.message ?? String(err), loading: false })
        }
      })

    return () => {
      cancelled = true
    }
  }, [call])

  return state
}
