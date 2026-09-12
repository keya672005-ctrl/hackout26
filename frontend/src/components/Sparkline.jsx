/**
 * The sparkline on an overview card — a glyph, not a chart: no axes, no
 * tooltip, no legend. The card states the value it trends toward, so the shape
 * is doing the only job it has. Plain SVG rather than a chart library, because
 * a 60x28 line does not need one.
 */
export default function Sparkline({ points = [], width = 96, height = 28 }) {
  if (points.length < 2) return <svg width={width} height={height} aria-hidden="true" />

  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const pad = 3
  const x = (i) => (i / (points.length - 1)) * (width - pad * 2) + pad
  const y = (v) => height - pad - ((v - min) / span) * (height - pad * 2)

  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const lastX = x(points.length - 1)
  const lastY = y(points[points.length - 1])

  return (
    <svg width={width} height={height} aria-hidden="true" focusable="false">
      <path
        d={d}
        fill="none"
        stroke="var(--series-sensor)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={lastX}
        cy={lastY}
        r="3"
        fill="var(--series-sensor)"
        stroke="var(--surface)"
        strokeWidth="2"
      />
    </svg>
  )
}
