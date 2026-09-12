/**
 * Facility selector for the overview.
 *
 * Six pond blocks across two facilities is past the point where a flat grid
 * reads as a list rather than as a portfolio, and the question a reader
 * actually arrives with is about one operator's ponds, not all of them. The
 * options are derived from the sites the API returned rather than hard-coded,
 * so a seventh block appears here the moment it appears in the data.
 *
 * A native <select> on purpose: it is keyboard- and screen-reader-correct
 * without any work, and on a phone it opens the platform picker instead of a
 * bespoke menu that has to be re-tested on every device.
 */
export default function FacilityFilter({ value, onChange, sites }) {
  const facilities = []
  for (const site of sites) {
    const found = facilities.find((f) => f.key === site.operator)
    if (found) found.count += 1
    else facilities.push({ key: site.operator, label: site.operator, location: site.location, count: 1 })
  }

  // One facility is not a choice — don't offer a control that cannot change
  // anything.
  if (facilities.length < 2) return null

  return (
    <>
      <span className="filter-label" id="facility-label">
        Facility
      </span>
      <select
        className="select"
        aria-labelledby="facility-label"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="all">All facilities ({sites.length} blocks)</option>
        {facilities.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label} — {f.location} ({f.count})
          </option>
        ))}
      </select>
    </>
  )
}
