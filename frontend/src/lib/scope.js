/**
 * Scoping the overview: which blocks an operator is looking at.
 *
 * Two axes, one control. A reader arrives asking about a *place* ("how are the
 * west-coast ponds doing") or about an *operator* ("show me that company"), and
 * those are different questions even though the current dataset answers them
 * with the same blocks -- each facility happens to sit in a region of its own.
 * That coincidence is a property of having two facilities, not of the model: a
 * second operator in an existing region would split the two axes immediately,
 * and both are derived from the API response rather than hard-coded, so that
 * would need no code change here.
 *
 * Scope values are strings so they survive a URL or localStorage unchanged:
 * `all`, `region:<region>`, `operator:<operator>`.
 */

/**
 * The region a site sits in, read off its own location string rather than
 * stored separately: a location reads "town, district, state, country", and the
 * region is the second-to-last segment. The last is always the country, which
 * is too coarse to group by while every site is in one.
 */
export function regionOf(site) {
  const parts = String(site?.location ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 2]
  return parts[0] ?? 'Unknown'
}

/** The distinct regions and operators present, each with its block count. */
export function buildScopes(sites) {
  const regions = []
  const operators = []
  for (const site of sites) {
    const region = regionOf(site)
    const foundRegion = regions.find((r) => r.key === region)
    if (foundRegion) foundRegion.count += 1
    else regions.push({ key: region, label: region, count: 1 })

    const foundOperator = operators.find((o) => o.key === site.operator)
    if (foundOperator) foundOperator.count += 1
    else operators.push({ key: site.operator, label: site.operator, count: 1 })
  }
  return { regions, operators }
}

/** Does this site fall inside the given scope? */
export function scopeMatches(scope, site) {
  if (!scope || scope === 'all') return true
  const separator = scope.indexOf(':')
  if (separator === -1) return true
  const kind = scope.slice(0, separator)
  const value = scope.slice(separator + 1)
  if (kind === 'region') return regionOf(site) === value
  if (kind === 'operator') return site.operator === value
  // An unknown scope shows everything rather than nothing: a stale value in
  // localStorage must not present an empty dashboard with no way to recover.
  return true
}
