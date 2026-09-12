export default function StatTile({ label, value, unit, foot, hero, children }) {
  return (
    <div className="card tile">
      <div className="tile-label">{label}</div>
      {children ?? (
        <div className={hero ? 'hero-value' : 'tile-value'}>
          {value}
          {unit ? <span className="tile-unit">{unit}</span> : null}
        </div>
      )}
      {foot ? <div className="tile-foot">{foot}</div> : null}
    </div>
  )
}
