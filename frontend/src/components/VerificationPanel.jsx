import StatusBadge from './StatusBadge'
import { pct } from '../lib/format'

/**
 * The verdict, the number it was made on, and the rule that made it.
 *
 * The gauge plots the observed divergence against the tolerance so the two are
 * read together — a verdict beside a bare percentage invites the reader to
 * guess which side of the line it falls on.
 */
export default function VerificationPanel({ verification, refetching }) {
  const { status, divergence_pct, tolerance_pct, explanation } = verification
  const verified = status === 'verified'

  const magnitude = Math.abs(divergence_pct ?? 0)
  // Scale so the tolerance mark sits at 60% of the track, leaving headroom for
  // a breach to visibly overshoot it rather than pinning at the end.
  const scaleMax = Math.max(magnitude, tolerance_pct ?? 0) * 1.45 || 1
  const toPct = (v) => `${Math.min(100, (v / scaleMax) * 100)}%`

  return (
    <section className={`card card-pad${refetching ? ' is-refetching' : ''}`}>
      <div className="card-head">
        <h2 className="card-title">Verification</h2>
        <span className="rule-tag">RULE-001</span>
      </div>

      <div className="verdict" style={{ marginTop: 12 }}>
        <StatusBadge status={status} size="lg" />
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>
            {pct(magnitude)}
          </div>
          <div className="tile-label">peak divergence · tolerance {pct(tolerance_pct, 0)}</div>
        </div>
      </div>

      <div className="gauge">
        <div className="gauge-track">
          <div
            className="gauge-fill"
            style={{
              width: toPct(magnitude),
              background: verified ? 'var(--status-verified-fg)' : 'var(--status-review-fg)',
            }}
          />
          <div
            className="gauge-limit"
            style={{ left: toPct(tolerance_pct ?? 0) }}
            title={`Tolerance ${pct(tolerance_pct, 0)}`}
          />
        </div>
        {/* Scale ends label the track itself; the tolerance caption is pinned
            under its own marker so the two can never drift apart. */}
        <div className="gauge-scale" style={{ position: 'relative' }}>
          <span>0%</span>
          <span
            style={{
              position: 'absolute',
              left: toPct(tolerance_pct ?? 0),
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
            }}
          >
            tolerance {pct(tolerance_pct, 0)}
          </span>
          <span>{pct(scaleMax, 0)}</span>
        </div>
      </div>

      <p className="explanation">{explanation}</p>
    </section>
  )
}
