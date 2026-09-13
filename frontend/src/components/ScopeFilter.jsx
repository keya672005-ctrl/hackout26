import { buildScopes } from '../lib/scope'

/**
 * Scope selector for the overview — was the facility selector, now offering
 * region as well.
 *
 * Six pond blocks is past the point where a flat grid reads as a list rather
 * than a portfolio, and the question a reader arrives with is about one place
 * or one operator, not all of them. Both axes are derived from the sites the
 * API returned rather than hard-coded, so a seventh block appears here the
 * moment it appears in the data.
 *
 * A native <select> with <optgroup> on purpose: it is keyboard- and
 * screen-reader-correct without any work, the groups label the two axes
 * without a second control, and on a phone it opens the platform picker
 * instead of a bespoke menu that has to be re-tested on every device.
 *
 * A group with one entry is not a choice, so it is not offered.
 */
export default function ScopeFilter({ value, onChange, sites }) {
  const { regions, operators } = buildScopes(sites)
  const offersRegion = regions.length > 1
  const offersOperator = operators.length > 1

  if (!offersRegion && !offersOperator) return null

  return (
    <>
      <span className="filter-label" id="scope-label">
        Scope
      </span>
      <select
        className="select"
        aria-labelledby="scope-label"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="all">All blocks ({sites.length})</option>

        {offersRegion ? (
          <optgroup label="By region">
            {regions.map((r) => (
              <option key={r.key} value={`region:${r.key}`}>
                {r.label} ({r.count})
              </option>
            ))}
          </optgroup>
        ) : null}

        {offersOperator ? (
          <optgroup label="By facility">
            {operators.map((o) => (
              <option key={o.key} value={`operator:${o.key}`}>
                {o.label} ({o.count})
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </>
  )
}
