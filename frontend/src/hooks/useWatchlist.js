import { useCallback, useEffect, useMemo, useState } from 'react'

const KEY = 'biofix-watchlist'

/**
 * The blocks this operator has chosen to watch.
 *
 * Kept in localStorage rather than on the server, deliberately: there is no
 * auth in this build, so there is no "this operator" for a backend to store it
 * against. A per-browser selection is the honest version of the feature, and
 * it says so on screen rather than implying an account that does not exist.
 *
 * Every read and write is wrapped: a private window throws on access, and the
 * dashboard must degrade to "the selection does not persist" rather than to a
 * blank screen.
 */
function read() {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export default function useWatchlist() {
  const [ids, setIds] = useState(read)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(ids))
    } catch {
      /* private window: the selection simply does not survive a reload */
    }
  }, [ids])

  const toggle = useCallback((id) => {
    setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const clear = useCallback(() => setIds([]), [])

  // A Set for the membership test the card grid runs once per block per render.
  const watched = useMemo(() => new Set(ids), [ids])
  const isWatched = useCallback((id) => watched.has(id), [watched])

  return { ids, isWatched, toggle, clear }
}
