import { useEffect, useState } from 'react'
import SiteOverview from './pages/SiteOverview'
import SiteDetail from './pages/SiteDetail'
import Report from './pages/Report'
import ThemeToggle from './components/ThemeToggle'

/**
 * Hash routing, hand-rolled.
 *
 * Three screens with no nested layouts does not justify a router dependency,
 * and hash URLs deep-link and survive a refresh on any static host — which is
 * what Phase 6 deploys to. Routes:
 *   #/                       site overview
 *   #/site/:id               site detail
 *   #/site/:id/report        verification report
 */
function parseHash(hash) {
  const path = hash.replace(/^#/, '').replace(/^\/+/, '')
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'site' && parts[1]) {
    return parts[2] === 'report'
      ? { name: 'report', siteId: decodeURIComponent(parts[1]) }
      : { name: 'detail', siteId: decodeURIComponent(parts[1]) }
  }
  return { name: 'overview' }
}

function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export default function App() {
  const route = useHashRoute()
  // The range filter scopes every screen, so it lives above the router rather
  // than resetting each time the reader moves between site and report.
  const [range, setRange] = useState('6w')

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <a className="brand" href="#/">
            <span className="brand-mark" aria-hidden="true">
              <img src="/favicon.svg" alt="" width="34" height="34" />
            </span>
            <span>
              <span className="brand-name">Algae Carbon Monitoring</span>
              <br />
              <span className="brand-sub">Sensor data, cross-verified against satellite</span>
            </span>
          </a>
          <span className="header-tools">
            <span className="rule-tag">HackOut&apos;26 · Pixel Error</span>
            <ThemeToggle />
          </span>
        </div>
      </header>

      <main>
        {route.name === 'overview' ? (
          <SiteOverview range={range} onRangeChange={setRange} />
        ) : null}
        {route.name === 'detail' ? (
          <SiteDetail siteId={route.siteId} range={range} onRangeChange={setRange} />
        ) : null}
        {route.name === 'report' ? <Report siteId={route.siteId} range={range} /> : null}
      </main>
    </>
  )
}
