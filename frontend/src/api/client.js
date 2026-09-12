// Fetch client for the backend API contract (architecture.md §3).
// Paths are same-origin; the Vite dev server proxies /api to FastAPI.

const BASE = '/api'

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    // The backend answers 404 for an unknown site and 400 for an unparseable
    // range, and puts the reason in `detail` — surface that rather than a bare
    // status code, so a demo mistype explains itself on screen.
    let detail = ''
    try {
      detail = (await res.json())?.detail ?? ''
    } catch {
      detail = ''
    }
    throw new Error(detail || `${res.status} ${res.statusText}`)
  }
  return res.json()
}

const withRange = (path, range) =>
  range && range !== 'all' ? `${path}?range=${encodeURIComponent(range)}` : path

export const ping = () => get('/ping')

export const listSites = (range) => get(withRange('/sites', range))

export const getSite = (siteId) => get(`/sites/${encodeURIComponent(siteId)}`)

export const getReadings = (siteId, range) =>
  get(withRange(`/sites/${encodeURIComponent(siteId)}/readings`, range))

export const getImageryIndex = (siteId, range) =>
  get(withRange(`/sites/${encodeURIComponent(siteId)}/imagery-index`, range))

export const getVerification = (siteId, range) =>
  get(withRange(`/sites/${encodeURIComponent(siteId)}/verification`, range))

export const getReport = (siteId, range) =>
  get(withRange(`/sites/${encodeURIComponent(siteId)}/report`, range))
