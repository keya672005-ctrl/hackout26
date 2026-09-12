// Display formatting. Kept in one place so the overview card, the detail
// header and the report can never disagree about how a number is written.

export const kg = (n) =>
  typeof n === 'number' ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'

export const tonnes = (n) =>
  typeof n === 'number'
    ? (n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })
    : '—'

export const pct = (n, digits = 1) =>
  typeof n === 'number' ? `${n.toFixed(digits)}%` : '—'

export const signedPct = (n, digits = 1) =>
  typeof n === 'number' ? `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%` : '—'

export const num = (n, digits = 2) =>
  typeof n === 'number' ? n.toFixed(digits) : '—'

/** "2026-08-01" -> "1 Aug" (axis ticks, tooltips). Parsed as a plain date, not
 *  a UTC instant, so it never shifts a day in a westward timezone. */
export const shortDate = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return String(iso)
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${MONTHS[m - 1]}`
}

export const longDate = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return String(iso)
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  return `${d} ${MONTHS[m - 1]} ${y}`
}

export const STATUS_LABEL = {
  verified: 'Verified',
  needs_review: 'Needs review',
}
