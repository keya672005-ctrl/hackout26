import { kg } from '../lib/format'

/**
 * What the watched blocks add up to.
 *
 * The point of letting an operator pick blocks is the total across exactly
 * those blocks -- a portfolio figure the flat grid cannot state. The
 * verified/flagged split sits beside it because a CO2 total is only worth as
 * much as the share of it the imagery supports, which is the platform's whole
 * argument applied to the reader's own selection.
 *
 * Figures are rendered from the API's own numbers, never animated, and carry
 * `data-watch` hooks so the Phase 4 gate can compare them against the same
 * sites it filtered.
 */
export default function WatchlistSummary({ sites, onClear }) {
  const total = sites.reduce((sum, s) => sum + (s.co2_sequestered_kg ?? 0), 0)
  const verified = sites.filter((s) => s.status === 'verified').length
  const flagged = sites.length - verified

  return (
    <div className="watch-summary" role="status" aria-live="polite">
      <div className="watch-stat">
        <span className="watch-stat-value" data-watch="count">{sites.length}</span>
        <span className="watch-stat-label">blocks watched</span>
      </div>
      <div className="watch-stat">
        <span className="watch-stat-value" data-watch="co2">{kg(total)}</span>
        <span className="watch-stat-label">kg CO₂ fixed</span>
      </div>
      <div className="watch-stat">
        <span className="watch-stat-value is-verified" data-watch="verified">{verified}</span>
        <span className="watch-stat-label">verified</span>
      </div>
      <div className="watch-stat">
        <span className="watch-stat-value is-review" data-watch="flagged">{flagged}</span>
        <span className="watch-stat-label">needs review</span>
      </div>
      {sites.length > 0 && onClear ? (
        <button type="button" className="watch-clear" onClick={onClear}>
          Clear
        </button>
      ) : null}
    </div>
  )
}
