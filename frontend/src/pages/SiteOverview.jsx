import { useCallback } from 'react'
import { listSites } from '../api/client'
import { useApi } from '../hooks/useApi'
import RangeFilter from '../components/RangeFilter'
import Sparkline from '../components/Sparkline'
import StatusBadge from '../components/StatusBadge'
import { kg } from '../lib/format'

function SiteCard({ site }) {
  return (
    <a className="card site-card" href={`#/site/${encodeURIComponent(site.site_id)}`}>
      <div className="site-card-top">
        <div>
          <div className="site-name">{site.name}</div>
          <div className="site-species">{site.species}</div>
        </div>
        <StatusBadge status={site.status} />
      </div>

      <div className="site-figure">
        <span className="site-figure-value">{kg(site.co2_sequestered_kg)}</span>
        <span className="site-figure-unit">kg CO₂ fixed</span>
      </div>

      <div className="site-card-foot">
        <Sparkline points={site.trend ?? []} />
        <span className="site-link">View site →</span>
      </div>
    </a>
  )
}

export default function SiteOverview({ range, onRangeChange }) {
  const { data, error, loading } = useApi(
    useCallback(() => listSites(range), [range]),
    [range],
  )

  return (
    <div className="page">
      <div className="page-head">
        <p className="eyebrow">Site overview</p>
        <h1 className="page-title">Monitored cultivation sites</h1>
        <p className="page-sub">
          Every headline figure below is cross-checked against independent Sentinel-2
          imagery before it is shown as verified. A site whose sensor record and satellite
          proxy disagree beyond tolerance is flagged for review rather than published.
        </p>
      </div>

      <RangeFilter value={range} onChange={onRangeChange} />

      {error ? (
        <div className="state state-error">Could not load sites — {error}</div>
      ) : null}

      {loading && !data ? <div className="state">Loading sites…</div> : null}

      {data ? (
        <div className={`grid grid-sites${loading ? ' is-refetching' : ''}`}>
          {data.map((site) => (
            <SiteCard key={site.site_id} site={site} />
          ))}
        </div>
      ) : null}

      {data && data.length === 0 ? (
        <div className="state">No sites are reporting yet.</div>
      ) : null}
    </div>
  )
}
