import { useCallback } from 'react'
import { getReport, getSite, getVerification } from '../api/client'
import { useApi } from '../hooks/useApi'
import StatusBadge from '../components/StatusBadge'
import { kg, pct, tonnes } from '../lib/format'

/**
 * Investor / credit-readiness report — the Phase 5 deliverable.
 *
 * Every figure is read from the live API. The registry fields (`report_id`,
 * `generated_at`, `reporting_period`, `agreement_pct`) now come from
 * `GET /api/sites/:id/report`, which assembles them in `reporting/report.py`
 * from the same engine and verification calls the dashboard uses — so the
 * document and the screen it was opened from cannot state different numbers.
 * Nothing on this page is computed in the browser except unit conversion.
 *
 * Export is `window.print()` against a print stylesheet rather than a PDF
 * library: the browser's own engine already paginates, embeds fonts and hits
 * "Save as PDF" on every platform, and a 200 kB dependency to re-do that
 * badly is not a trade worth making at this scale.
 */
export default function Report({ siteId, range }) {
  const { data, error } = useApi(
    useCallback(
      () =>
        Promise.all([
          getSite(siteId),
          getVerification(siteId, range),
          getReport(siteId, range),
        ]).then(([site, verification, report]) => ({ site, verification, report })),
      [siteId, range],
    ),
    [siteId, range],
  )

  if (error) {
    return (
      <div className="page">
        <a className="breadcrumb" href={`#/site/${encodeURIComponent(siteId)}`}>
          ← Back to site
        </a>
        <div className="state state-error">Could not load report — {error}</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="page">
        <a className="breadcrumb" href={`#/site/${encodeURIComponent(siteId)}`}>
          ← Back to site
        </a>
        <div className="state">Loading report…</div>
      </div>
    )
  }

  const { site, verification, report } = data
  const empty = report.co2_sequestered_kg === 0

  return (
    <div className="page report-page">
      <a className="breadcrumb no-print" href={`#/site/${encodeURIComponent(siteId)}`}>
        ← Back to site
      </a>

      {/* Printed pages lose the app chrome, so the document names itself. */}
      <div className="print-only print-masthead">
        <span>BioFix — verification report</span>
        <span className="mono">{report.report_id}</span>
      </div>

      <div className="page-head report-title-row">
        <div>
          <p className="eyebrow">Verification report</p>
          <h1 className="page-title">{site.name}</h1>
          <p className="page-sub">
            Cross-verified CO₂ fixation for the reporting period, with the independent
            satellite check that produced the verdict.
          </p>
        </div>
        <button type="button" className="print-button no-print" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <div className="stack">
        <section className="card card-pad">
          <div className="report-head">
            <div>
              <div className="tile-label">CO₂ fixed over the reporting period</div>
              <div className="hero-value" style={{ marginTop: 8 }}>
                {tonnes(report.co2_sequestered_kg)}
                <span className="tile-unit" style={{ fontSize: 18 }}>
                  t CO₂
                </span>
              </div>
              <div className="tile-foot">
                {kg(report.co2_sequestered_kg)} kg · gross biological fixation
              </div>
            </div>
            <StatusBadge status={report.status} size="lg" />
          </div>

          {empty ? (
            <div className="notice" style={{ marginTop: 18 }}>
              <strong>No sensor readings in this window.</strong> The figure above is zero
              because this site has not reported, not because it fixed no carbon. The
              verdict reflects that the claim could not be checked.
            </div>
          ) : null}
        </section>

        <section className="card card-pad">
          <h2 className="card-title" style={{ marginBottom: 14 }}>
            Report details
          </h2>
          <div className="meta-list">
            <div className="meta-row">
              <span className="meta-key">Report ID</span>
              <span className="meta-value mono">{report.report_id}</span>
            </div>
            <div className="meta-row">
              <span className="meta-key">Generated</span>
              <span className="meta-value">{report.generated_at}</span>
            </div>
            <div className="meta-row">
              <span className="meta-key">Site</span>
              <span className="meta-value">
                {site.name} ({site.site_id})
              </span>
            </div>
            <div className="meta-row">
              <span className="meta-key">Species</span>
              <span className="meta-value">{site.species}</span>
            </div>
            <div className="meta-row">
              <span className="meta-key">Cultivation system</span>
              <span className="meta-value">
                {site.pond_type} · {Number(site.pond_area_m2).toLocaleString('en-US')} m²
              </span>
            </div>
            <div className="meta-row">
              <span className="meta-key">Reporting period</span>
              {/* Verbatim from the API: this exact string is part of what the
                  report id fingerprints, so it is not re-prettified here. */}
              <span className="meta-value mono">{report.reporting_period}</span>
            </div>
            <div className="meta-row">
              <span className="meta-key">Conversion factor</span>
              <span className="meta-value">1.8321 kg CO₂ / kg dry biomass</span>
            </div>
            <div className="meta-row">
              <span className="meta-key">Agreement with satellite</span>
              <span className="meta-value">{pct(report.agreement_pct)}</span>
            </div>
            <div className="meta-row">
              <span className="meta-key">Peak divergence vs. satellite</span>
              <span className="meta-value">
                {pct(Math.abs(verification.divergence_pct))} (tolerance{' '}
                {pct(verification.tolerance_pct, 0)})
              </span>
            </div>
            <div className="meta-row">
              <span className="meta-key">Verdict</span>
              <span className="meta-value">
                <StatusBadge status={report.status} />
              </span>
            </div>
          </div>
        </section>

        <section className="card card-pad">
          <h2 className="card-title">Basis of the verdict</h2>
          <p className="explanation">{verification.explanation}</p>
          <div className="notice">
            <strong>What this figure is.</strong> The sensor record supports biological CO₂
            <em> fixation</em> over the reporting period. Whether that carbon stays out of
            the atmosphere depends on what the harvested biomass becomes, which is outside
            this platform&apos;s scope — so the figure is reported as fixed, not as
            permanently sequestered.
          </div>
          <div className="notice">
            <strong>How to check this report id.</strong>{' '}
            <code className="mono">{report.report_id}</code> is a fingerprint of what this
            document claims — the site, the period, the CO₂ figure, the verdict and the
            rule that produced it. Re-running the platform on the same data reproduces the
            same id; changing any published figure produces a different one. It is not a
            registry serial number, and this platform is not an issuing authority.
          </div>
        </section>

        <div className="print-only print-foot">
          Agreement {pct(report.agreement_pct)} against a {pct(verification.tolerance_pct, 0)}{' '}
          tolerance · {report.report_id} · generated {report.generated_at}
        </div>
      </div>
    </div>
  )
}
