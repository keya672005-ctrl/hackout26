import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { kg, shortDate } from '../lib/format'

const COLOR = 'var(--series-sensor)'

function Co2Tooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="tooltip">
      <div className="tooltip-date">{shortDate(label)}</div>
      <div className="tooltip-row">
        <span className="tooltip-key" style={{ borderTopColor: COLOR }} />
        <span className="tooltip-value">{kg(payload[0].value)}</span>
        <span className="tooltip-name">kg CO₂</span>
      </div>
    </div>
  )
}

/** Single series, so no legend box — the card title already names what is plotted. */
export default function Co2Chart({ rows, refetching }) {
  return (
    <section className="card card-pad">
      <div className="card-head">
        <div>
          <h2 className="card-title">Cumulative CO₂ fixed</h2>
          <p className="card-note">
            Gross production × 1.8321 kg CO₂ per kg dry biomass, accumulated across the
            window. Carbon is fixed as biomass grows, so harvesting does not un-fix it —
            the curve never steps down.
          </p>
        </div>
      </div>

      <div className={`chart-frame chart-frame-sm${refetching ? ' is-refetching' : ''}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 12, right: 16, bottom: 4, left: 8 }}>
            <defs>
              {/* A wash, never a saturated block. */}
              <linearGradient id="co2-wash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#687b55" stopOpacity={0.14} />
                <stop offset="100%" stopColor="#687b55" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--grid)" strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--line)' }}
              minTickGap={28}
            />
            <YAxis
              tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={46}
            />
            <Tooltip
              content={<Co2Tooltip />}
              cursor={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="co2"
              stroke={COLOR}
              strokeWidth={2}
              strokeLinecap="round"
              fill="url(#co2-wash)"
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2, fill: COLOR }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
