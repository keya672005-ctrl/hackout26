import { useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { num, shortDate } from '../lib/format'

const SENSOR = 'var(--series-sensor)'
const SATELLITE = 'var(--series-satellite)'

const SERIES = [
  { key: 'sensor', name: 'Sensor (reported biomass)', color: SENSOR, dash: null },
  { key: 'satellite', name: 'Satellite (NDCI proxy)', color: SATELLITE, dash: '5 4' },
]

/** Index of the last row carrying a value for this series. */
const lastWithValue = (rows, key) => {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (typeof rows[i][key] === 'number') return i
  }
  return -1
}

/** End-marker + direct label, drawn only on the final point of each series.
 *  Labelling every point would be noise; the endpoint is the one that matters. */
function EndDot({ cx, cy, index, lastIndex, color, value }) {
  if (index !== lastIndex || cx == null || cy == null) return null
  return (
    <g>
      {/* 2px surface ring keeps the marker legible where the lines cross */}
      <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
      <text
        x={cx - 9}
        y={cy - 10}
        textAnchor="end"
        fontSize={12}
        fontWeight={600}
        /* Text wears a text token, never the series colour — the dot beside it
           carries the identity. */
        fill="var(--text-secondary)"
      >
        {num(value, 0)}
      </text>
    </g>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload ?? {}
  return (
    <div className="tooltip">
      <div className="tooltip-date">{shortDate(label)}</div>
      {SERIES.map(({ key, name, color }) => {
        const v = row[key]
        return (
          <div className="tooltip-row" key={key}>
            <span
              className="tooltip-key"
              style={{ borderTopColor: color, borderTopStyle: key === 'satellite' ? 'dashed' : 'solid' }}
            />
            <span className="tooltip-value">{typeof v === 'number' ? num(v, 1) : '—'}</span>
            <span className="tooltip-name">{name.split(' (')[0]}</span>
          </div>
        )
      })}
      {typeof row.density === 'number' || typeof row.ndci === 'number' ? (
        <div className="tooltip-row" style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--grid)' }}>
          <span className="tooltip-name" style={{ marginLeft: 0, fontSize: 12 }}>
            {typeof row.density === 'number' ? `${num(row.density, 3)} g/L` : ''}
            {typeof row.density === 'number' && typeof row.ndci === 'number' ? ' · ' : ''}
            {typeof row.ndci === 'number' ? `NDCI ${num(row.ndci, 4)}` : ''}
          </span>
        </div>
      ) : null}
    </div>
  )
}

export default function ReconciliationChart({ rows, refetching }) {
  const [showTable, setShowTable] = useState(false)
  const lastIdx = {
    sensor: lastWithValue(rows, 'sensor'),
    satellite: lastWithValue(rows, 'satellite'),
  }

  return (
    <section className="card card-pad">
      <div className="card-head">
        <div>
          <h2 className="card-title">Sensor vs. satellite</h2>
          <p className="card-note">
            Both signals indexed to 100 at the start of the window. Reported biomass is in
            g/L and the satellite proxy is a dimensionless band index, so they share a
            normalised axis rather than two — which is also exactly what RULE-001 compares.
          </p>
        </div>
        <button
          type="button"
          className="table-toggle"
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
        >
          {showTable ? 'Hide table' : 'View as table'}
        </button>
      </div>

      <div className="legend" style={{ marginTop: 12 }}>
        {SERIES.map(({ key, name, color, dash }) => (
          <span className="legend-item" key={key}>
            <span
              className="legend-key"
              style={{ borderTopColor: color, borderTopStyle: dash ? 'dashed' : 'solid' }}
            />
            {name}
          </span>
        ))}
      </div>

      <div className={`chart-frame${refetching ? ' is-refetching' : ''}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 18, right: 44, bottom: 4, left: 0 }}>
            {/* Solid hairline grid, horizontal only — never dashed. */}
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
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={46}
              domain={['auto', 'auto']}
              label={{
                value: 'Index (start = 100)',
                angle: -90,
                position: 'insideLeft',
                style: { fill: 'var(--text-muted)', fontSize: 11, textAnchor: 'middle' },
              }}
            />
            {/* The calibration base both series are measured from. */}
            <ReferenceLine y={100} stroke="var(--line)" strokeWidth={1} />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
            />
            {SERIES.map(({ key, name, color, dash }) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={name}
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={dash ?? undefined}
                connectNulls
                isAnimationActive={false}
                activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2, fill: color }}
                dot={(props) => (
                  <EndDot
                    key={`${key}-${props.index}`}
                    {...props}
                    lastIndex={lastIdx[key]}
                    color={color}
                    value={props.payload?.[key]}
                  />
                )}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {showTable ? (
        <div className="table-scroll">
          <table>
            <caption className="sr-only">
              Sensor and satellite indices by date, with the underlying measurements
            </caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Sensor index</th>
                <th scope="col">Satellite index</th>
                <th scope="col">Density (g/L)</th>
                <th scope="col">NDCI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date}>
                  <td>{r.date}</td>
                  <td>{typeof r.sensor === 'number' ? num(r.sensor, 1) : '—'}</td>
                  <td>{typeof r.satellite === 'number' ? num(r.satellite, 1) : '—'}</td>
                  <td>{typeof r.density === 'number' ? num(r.density, 3) : '—'}</td>
                  <td>{typeof r.ndci === 'number' ? num(r.ndci, 4) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
