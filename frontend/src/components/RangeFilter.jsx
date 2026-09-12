const RANGES = [
  { value: '6w', label: '6 weeks' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All' },
]

/**
 * One row, above the charts, scoping everything below it — never a per-chart
 * control. Ranges anchor on the last reading rather than today's date, so the
 * window is stable whenever the demo runs.
 */
export default function RangeFilter({ value, onChange, inline }) {
  const Row = inline ? 'span' : 'div'
  return (
    <Row className={inline ? 'filter-group' : 'filter-row'}>
      <span className="filter-label" id="range-label">
        Reporting window
      </span>
      <div className="segmented" role="group" aria-labelledby="range-label">
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            aria-pressed={value === r.value}
            onClick={() => onChange(r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>
    </Row>
  )
}
