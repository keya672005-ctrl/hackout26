import { useCallback } from 'react'
import { getImageryIndex, getReadings, getSite, getVerification } from '../api/client'
import { useApi } from '../hooks/useApi'
import RangeFilter from '../components/RangeFilter'
import ReconciliationChart from '../components/ReconciliationChart'
import Co2Chart from '../components/Co2Chart'
import VerificationPanel from '../components/VerificationPanel'
import StatTile from '../components/StatTile'
import StatusBadge from '../components/StatusBadge'
import { buildCo2, buildReconciliation } from '../lib/series'
import { kg, longDate, num, pct } from '../lib/format'

export default function SiteDetail({ siteId, range, onRangeChange }) {
  const { data, error, loading } = useApi(
    useCallback(
      () =>
        Promise.all([
          getSite(siteId),
          getReadings(siteId, range),
          getImageryIndex(siteId, range),
          getVerification(siteId, range),
        ]).then(([site, readings, imagery, verification]) => ({
          site,
          readings: readings.series ?? [],
          imagery: imagery.series ?? [],
          verification,
        })),
      [siteId, range],
    ),
    [siteId, range],
  )

  if (error) {
    return (
      <div className="page">
        <a className="breadcrumb" href="#/">
          ← All sites
        </a>
        <div className="state state-error">Could not load {siteId} — {error}</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="page">
        <a className="breadcrumb" href="#/">
          ← All sites
        </a>
        <div className="state">Loading site…</div>
      </div>
    )
  }

  const { site, readings, imagery, verification } = data
  const rows = buildReconciliation(readings, imagery)
  const co2Rows = buildCo2(readings)
  const total = readings.length ? readings[readings.length - 1].co2_uptake_cum_kg : 0
  const latest = readings.length ? readings[readings.length - 1] : null

  return (
    <div className="page">
      <a className="breadcrumb" href="#/">
        ← All sites
      </a>

      <div className="page-head">
        <p className="eyebrow">{site.pond_type}</p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
            marginTop: 8,
          }}
        >
          <h1 className="page-title" style={{ marginTop: 0 }}>
            {site.name}
          </h1>
          <StatusBadge status={site.status} />
        </div>
        <p className="page-sub">
          <em>{site.species}</em> · {Number(site.pond_area_m2).toLocaleString('en-US')} m²
          {' · commissioned '}
          {longDate(site.commissioning_date)}
        </p>
      </div>

      <RangeFilter value={range} onChange={onRangeChange} />

      <div className="stack">
        <div className="grid grid-tiles">
          <StatTile
            label="CO₂ fixed this window"
            value={kg(total)}
            unit="kg"
            foot={readings.length ? `${readings.length} days of readings` : 'no readings'}
          />
          <StatTile
            label="Peak divergence"
            value={pct(Math.abs(verification.divergence_pct))}
            foot={`tolerance ${pct(verification.tolerance_pct, 0)}`}
          />
          <StatTile
            label="Latest biomass density"
            value={latest ? num(latest.biomass_density_g_L, 3) : '—'}
            unit="g/L"
            foot={latest ? latest.date : '—'}
          />
          <StatTile label="Verification" foot="RULE-001">
            <div style={{ marginTop: 10 }}>
              <StatusBadge status={verification.status} size="lg" />
            </div>
          </StatTile>
        </div>

        <ReconciliationChart rows={rows} refetching={loading} />

        <VerificationPanel verification={verification} refetching={loading} />

        <Co2Chart rows={co2Rows} refetching={loading} />

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <a
            className="site-link"
            href={`#/site/${encodeURIComponent(siteId)}/report`}
            style={{ textDecoration: 'none' }}
          >
            Open verification report →
          </a>
        </div>
      </div>
    </div>
  )
}
