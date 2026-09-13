import { useCallback, useState } from 'react'
import { listSites } from '../api/client'
import { useApi } from '../hooks/useApi'
import useWatchlist from '../hooks/useWatchlist'
import ScopeFilter from '../components/ScopeFilter'
import RangeFilter from '../components/RangeFilter'
import WatchlistSummary from '../components/WatchlistSummary'
import Sparkline from '../components/Sparkline'
import StatusBadge from '../components/StatusBadge'
import { kg } from '../lib/format'
import { scopeMatches } from '../lib/scope'

function SiteCard({ site }) {
  return (
    <a className="card site-card" href={`#/site/${encodeURIComponent(site.site_id)}`}>
      <div className="site-card-top">
        <div>
          <div className="site-name">{site.name}</div>
          <div className="site-species">{site.species}</div>
          <div className="site-operator">{site.operator}</div>
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

/**
 * The watch control is a SIBLING of the card, never a child.
 *
 * `.site-card` is an anchor, and the gates click it and read its href to prove
 * the grid navigates. A checkbox nested inside an anchor fights it for the
 * click and would make "select a block" and "open a block" the same gesture.
 * The cell wrapper keeps them separate for the reader and leaves the anchor
 * exactly as the gates expect to find it.
 */
function SiteCell({ site, watched, onToggle }) {
  return (
    <div className={`site-cell${watched ? ' is-watched' : ''}`}>
      <label className="watch-toggle">
        <input
          type="checkbox"
          className="watch-check"
          checked={watched}
          data-site={site.site_id}
          onChange={() => onToggle(site.site_id)}
        />
        <span>{watched ? 'Watching' : 'Watch'}</span>
      </label>
      <SiteCard site={site} />
    </div>
  )
}

export default function SiteOverview({ range, onRangeChange }) {
  const { data, error, loading } = useApi(
    useCallback(() => listSites(range), [range]),
    [range],
  )

  // Scope is local to this screen: it narrows which blocks are listed, and
  // there is nothing to narrow once the reader is inside one of them.
  const [scope, setScope] = useState('all')
  const [mode, setMode] = useState('all')
  const { ids, isWatched, toggle, clear } = useWatchlist()

  // Scope first, then the watchlist. The order matters for the empty states:
  // "nothing in this region" and "nothing watched here yet" are different
  // problems and need different ways out.
  const inScope = data ? data.filter((s) => scopeMatches(scope, s)) : []
  const shown = mode === 'watchlist' ? inScope.filter((s) => isWatched(s.site_id)) : inScope

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

      <div className="filter-row">
        <RangeFilter value={range} onChange={onRangeChange} inline />
        {data ? <ScopeFilter value={scope} onChange={setScope} sites={data} /> : null}
        <span className="filter-group">
          <span className="filter-label" id="mode-label">
            Showing
          </span>
          {/* "All blocks", not "All": the reporting-window control in this same
              row already has an "All", and two buttons labelled identically a
              few centimetres apart is a coin toss for the reader. The
              data-mode attributes exist for the same reason on the gate's
              side -- selecting by button text picked the wrong group. */}
          <div className="segmented" role="group" aria-labelledby="mode-label">
            <button
              type="button"
              data-mode="all"
              aria-pressed={mode === 'all'}
              onClick={() => setMode('all')}
            >
              All blocks
            </button>
            <button
              type="button"
              data-mode="watchlist"
              aria-pressed={mode === 'watchlist'}
              onClick={() => setMode('watchlist')}
            >
              My watchlist ({ids.length})
            </button>
          </div>
        </span>
      </div>

      {mode === 'watchlist' ? <WatchlistSummary sites={shown} onClear={clear} /> : null}

      {error ? (
        <div className="state state-error">Could not load sites — {error}</div>
      ) : null}

      {loading && !data ? <div className="state">Loading sites…</div> : null}

      {data ? (
        <div className={`grid grid-sites${loading ? ' is-refetching' : ''}`}>
          {shown.map((site) => (
            <SiteCell
              key={site.site_id}
              site={site}
              watched={isWatched(site.site_id)}
              onToggle={toggle}
            />
          ))}
        </div>
      ) : null}

      {data && data.length === 0 ? (
        <div className="state">No sites are reporting yet.</div>
      ) : null}

      {data && data.length > 0 && inScope.length === 0 ? (
        <div className="state">No blocks in this scope for the selected window.</div>
      ) : null}

      {data && inScope.length > 0 && shown.length === 0 ? (
        <div className="state">
          Nothing watched in this scope yet — tick <strong>Watch</strong> on a block to add
          it. The selection is kept in this browser only; there are no accounts in this
          build.
        </div>
      ) : null}
    </div>
  )
}
