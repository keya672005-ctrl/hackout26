#!/usr/bin/env node
/**
 * Phase 5 gate — Reporting & Polish (prd.md §11).
 *
 * The two checklist items:
 *   1. Exported report numbers match what the dashboard shows for the same site.
 *   2. Report is legible and correctly formatted when opened fresh (not just in
 *      an in-browser preview).
 *
 * Item 1 is checked as a *closed loop*: the same figure is read from four
 * independent places — `/api/sites` (overview card), the site-detail tile in the
 * rendered DOM, `/api/sites/:id/readings`, and `/api/sites/:id/report` — and all
 * four must agree. A report that quietly recomputed its own total would pass a
 * spot check and fail here.
 *
 * Item 2 is the one that is easy to fake, so it is checked against the real
 * artifact: the page is rendered through Chrome's own print pipeline with
 * `Page.printToPDF`, and the returned bytes are inspected — valid PDF, A4 page
 * box, bounded page count. Structure is asserted rather than extracted text:
 * pulling text out of a subset-font PDF without a library is unreliable, and a
 * check that is flaky is worse than one that is narrow. The *content* of the
 * printed page is verified separately, by reading the DOM under emulated print
 * media, which is the same cascade the PDF is rendered from.
 *
 * Run:  node verify_phase5.mjs      (from frontend/)
 */

import { spawn } from 'node:child_process'
import { join } from 'node:path'

import {
  BACKEND, STATUS_LABEL, boot, check, eq, finish, heading, kg, openBrowser,
  pct, pythonPath, sleep, tonnes,
} from './verify_lib.mjs'

/** Run a snippet against the backend's own modules; returns parsed stdout. */
function inBackend(code) {
  return new Promise((res, rej) => {
    const p = spawn(pythonPath(), ['-c', code], { cwd: BACKEND })
    let out = '', err = ''
    p.stdout.on('data', (c) => { out += c })
    p.stderr.on('data', (c) => { err += c })
    p.on('exit', (c) => (c === 0 ? res(out.trim()) : rej(new Error(err.slice(-800)))))
  })
}

/** A4 at 72 dpi, which is what Chrome writes into /MediaBox. */
const A4_PT = { w: 595, h: 842 }

async function main() {
  heading('1. Build and boot')
  const { base, api } = await boot()

  const sites = await api('/api/sites?range=6w')
  // A verified site and a flagged one, chosen by verdict rather than by
  // position. With six blocks in the list, sites[0] and sites[1] can easily be
  // two of the same verdict -- and the whole point of switching between them
  // here is to prove the screen re-renders a *different* verdict.
  const siteA = sites.find((s) => s.status === 'verified') ?? sites[0]
  const siteB = sites.find((s) => s.status !== siteA.status) ?? sites[1]

  // --- 2. the contract ----------------------------------------------------
  heading('2. /report matches the architecture.md §3 contract')

  const CONTRACT = ['site_id', 'report_id', 'generated_at', 'reporting_period',
    'co2_sequestered_kg', 'status', 'agreement_pct']

  const reportA = await api(`/api/sites/${siteA.site_id}/report?range=6w`)
  eq('response carries exactly the contract keys, in order',
    Object.keys(reportA).join(','), CONTRACT.join(','))
  check('types match the contract',
    typeof reportA.site_id === 'string' && typeof reportA.report_id === 'string' &&
      typeof reportA.generated_at === 'string' && typeof reportA.reporting_period === 'string' &&
      typeof reportA.co2_sequestered_kg === 'number' && typeof reportA.agreement_pct === 'number',
    JSON.stringify(reportA))
  check('generated_at is an ISO date', /^\d{4}-\d{2}-\d{2}$/.test(reportA.generated_at),
    reportA.generated_at)
  check('status is one of the contract enum values',
    ['verified', 'needs_review'].includes(reportA.status), reportA.status)

  const notFound = await fetch(`${base}/api/sites/no-such-site/report`)
  eq('unknown site is a 404, not a 500', notFound.status, 404)
  const badRange = await fetch(`${base}/api/sites/${siteA.site_id}/report?range=zz`)
  eq('unparseable range is a 400, not a 500', badRange.status, 400)

  // --- 3. the numbers agree everywhere ------------------------------------
  heading('3. Report figures match every other source (checklist item 1)')

  for (const s of sites) {
    for (const range of ['6w', '30d', 'all']) {
      const [report, readings, verification, list] = await Promise.all([
        api(`/api/sites/${s.site_id}/report?range=${range}`),
        api(`/api/sites/${s.site_id}/readings?range=${range}`),
        api(`/api/sites/${s.site_id}/verification?range=${range}`),
        api(`/api/sites?range=${range}`),
      ])
      const card = list.find((x) => x.site_id === s.site_id)
      const lastCum = readings.series.length
        ? readings.series[readings.series.length - 1].co2_uptake_cum_kg : 0

      eq(`${s.site_id} @${range}: report figure == overview card figure`,
        report.co2_sequestered_kg, card.co2_sequestered_kg)
      eq(`${s.site_id} @${range}: report figure == last cumulative reading`,
        report.co2_sequestered_kg, lastCum)
      eq(`${s.site_id} @${range}: report verdict == verification verdict`,
        report.status, verification.status)
      eq(`${s.site_id} @${range}: report verdict == overview card verdict`,
        report.status, card.status)
      eq(`${s.site_id} @${range}: agreement is the complement of peak divergence`,
        report.agreement_pct,
        Math.round(Math.max(0, 100 - Math.abs(verification.divergence_pct)) * 10) / 10)
      eq(`${s.site_id} @${range}: reporting period matches the readings series`,
        report.reporting_period,
        readings.series.length
          ? `${readings.series[0].date} to ${readings.series[readings.series.length - 1].date} (${readings.series.length} days)`
          : 'No sensor readings in the requested window')

      // An agreement score that disagreed with the badge beside it would be
      // worse than no score at all.
      if (report.status === 'verified') {
        check(`${s.site_id} @${range}: a verified site scores above the tolerance floor`,
          report.agreement_pct >= 100 - verification.tolerance_pct,
          `${report.agreement_pct}% vs floor ${100 - verification.tolerance_pct}%`)
      } else {
        check(`${s.site_id} @${range}: a flagged site does not score as full agreement`,
          report.agreement_pct < 100, `${report.agreement_pct}%`)
      }
    }
  }

  // --- 4. the report id means something -----------------------------------
  heading('4. Report id is a fingerprint, not decoration')

  const again = await api(`/api/sites/${siteA.site_id}/report?range=6w`)
  eq('same data re-requested yields the same id', again.report_id, reportA.report_id)
  check('id carries the reporting period year', reportA.report_id.includes('-2026-'),
    reportA.report_id)
  check('id is the documented shape', /^AC-\d{4}-[0-9A-F]{6}$/.test(reportA.report_id),
    reportA.report_id)

  const reportB = await api(`/api/sites/${siteB.site_id}/report?range=6w`)
  check('a different site gets a different id', reportA.report_id !== reportB.report_id,
    `${reportA.report_id} vs ${reportB.report_id}`)
  const report30 = await api(`/api/sites/${siteA.site_id}/report?range=30d`)
  check('a different reporting period gets a different id',
    reportA.report_id !== report30.report_id,
    `${reportA.report_id} vs ${report30.report_id}`)

  // The property that matters for an MRV document: change a published figure,
  // and the identifier cannot follow it. Exercised against the real function.
  const drift = await inBackend(
    'from reporting import report as r;' +
    'a=r._fingerprint("site-a","p",100.0,"verified",11.5,"RULE-001");' +
    'b=r._fingerprint("site-a","p",100.01,"verified",11.5,"RULE-001");' +
    'c=r._fingerprint("site-a","p",100.0,"needs_review",11.5,"RULE-001");' +
    'd=r._fingerprint("site-a","p",100.0,"verified",11.5,"RULE-001");' +
    'print(a,b,c,d)')
  const [f1, f2, f3, f4] = drift.split(/\s+/)
  check('changing the CO2 figure changes the id', f1 !== f2, `${f1} -> ${f2}`)
  check('changing the verdict changes the id', f1 !== f3, `${f1} -> ${f3}`)
  check('identical claims give an identical id', f1 === f4, `${f1} == ${f4}`)

  const genTime = await inBackend(
    'import reporting.report as r, inspect;' +
    's=inspect.getsource(r._fingerprint);' +
    'print("generated_at" in s or "now(" in s)')
  eq('generation time is excluded from the fingerprint', genTime, 'False')

  // --- 5. the empty window is stated, not implied -------------------------
  heading('5. A site with no readings reports that, rather than zero silently')

  const emptyOut = await inBackend(
    'from engine import co2;' +
    'from reporting import report as r;' +
    'co2.daily_series = lambda *a, **k: [];' +
    'rep = r.build("site-a");' +
    'print(rep.co2_sequestered_kg, "|", rep.reporting_period, "|", rep.status)')
  const [zero, period, status] = emptyOut.split('|').map((x) => x.trim())
  eq('figure is zero when nothing was reported', zero, '0.0')
  eq('period says why rather than printing an empty range', period,
    'No sensor readings in the requested window')
  eq('an unreportable site is never verified', status, 'needs_review')

  // --- browser ------------------------------------------------------------
  const { page, cleanup } = await openBrowser()

  // --- 6. the report screen renders the API's own values ------------------
  heading('6. Report screen shows the API values verbatim')

  const readReport = `() => ({
    title: document.querySelector('.page-title')?.textContent ?? '',
    hero: document.querySelector('.hero-value')?.textContent ?? '',
    heroFoot: document.querySelector('.tile-foot')?.textContent ?? '',
    rows: Object.fromEntries([...document.querySelectorAll('.meta-row')].map((r) => [
      r.querySelector('.meta-key')?.textContent ?? '',
      r.querySelector('.meta-value')?.textContent?.trim() ?? '',
    ])),
    badge: document.querySelector('.report-head .badge')?.textContent?.trim() ?? '',
    masthead: document.querySelector('.print-masthead')?.textContent ?? '',
    foot: document.querySelector('.print-foot')?.textContent ?? '',
    buttonVisible: (() => {
      const b = document.querySelector('.print-button')
      return !!b && getComputedStyle(b).display !== 'none'
    })(),
    chromeVisible: (() => {
      const h = document.querySelector('.app-header')
      return !!h && getComputedStyle(h).display !== 'none'
    })(),
    printOnlyVisible: [...document.querySelectorAll('.print-only')]
      .some((e) => getComputedStyle(e).display !== 'none'),
  })`

  await page.goto(`${base}/#/site/${siteA.site_id}/report`,
    `() => document.querySelector('.hero-value') !== null`, 'report screen')
  const view = await page.evaluate(readReport)

  eq('report id on screen is the API id', view.rows['Report ID'], reportA.report_id)
  eq('generated date on screen is the API date', view.rows.Generated, reportA.generated_at)
  eq('reporting period on screen is the API string, unaltered',
    view.rows['Reporting period'], reportA.reporting_period)
  eq('agreement on screen is the API figure',
    view.rows['Agreement with satellite'], pct(reportA.agreement_pct))
  check('headline tonnage is the API figure converted',
    view.hero.startsWith(tonnes(reportA.co2_sequestered_kg)),
    `${view.hero} vs ${tonnes(reportA.co2_sequestered_kg)}`)
  check('kg subtitle agrees with the tonnage above it',
    view.heroFoot.includes(kg(reportA.co2_sequestered_kg)), view.heroFoot)
  eq('verdict badge is the API verdict', view.badge, STATUS_LABEL[reportA.status])
  check('the export control is offered on screen', view.buttonVisible, '')
  check('print-only furniture is hidden on screen', !view.printOnlyVisible, '')
  check('no console errors or failed requests — report screen',
    page.problems.length === 0, page.problems.slice(0, 4).join(' | '))

  // --- 7. dashboard-to-report closed loop ---------------------------------
  heading('7. The report and the dashboard state the same number (checklist item 1)')

  await page.goto(`${base}/#/site/${siteA.site_id}`,
    `() => document.querySelectorAll('.tile').length >= 4`, 'site detail')
  const dashFigure = await page.evaluate(`() => {
    const t = [...document.querySelectorAll('.tile')].find((x) =>
      (x.querySelector('.tile-label')?.textContent ?? '').startsWith('CO₂ fixed'))
    return t?.querySelector('.tile-value')?.textContent ?? ''
  }`)
  check('site-detail tile and report hero are the same figure',
    dashFigure.startsWith(kg(reportA.co2_sequestered_kg)) &&
      view.hero.startsWith(tonnes(reportA.co2_sequestered_kg)),
    `dashboard ${dashFigure} / report ${view.hero}`)

  // And the flagged site, where a mismatch would be most damaging.
  await page.goto(`${base}/#/site/${siteB.site_id}/report`,
    `() => document.querySelector('.hero-value') !== null`, 'site B report')
  const viewB = await page.evaluate(readReport)
  eq('flagged site: report id matches its own API response',
    viewB.rows['Report ID'], reportB.report_id)
  eq('flagged site: verdict on the document is Needs review',
    viewB.badge, STATUS_LABEL[reportB.status])
  eq('flagged site: agreement figure matches', viewB.rows['Agreement with satellite'],
    pct(reportB.agreement_pct))
  check('flagged site: no console errors', page.problems.length === 0,
    page.problems.slice(0, 4).join(' | '))

  // --- 8. print rendering --------------------------------------------------
  heading('8. Printed document is formatted for paper (checklist item 2)')

  await page.goto(`${base}/#/site/${siteA.site_id}/report`,
    `() => document.querySelector('.hero-value') !== null`, 'report screen')
  await page.setMedia('print')
  await sleep(300)

  const printed = await page.evaluate(`() => {
    const vis = (sel) => {
      const e = document.querySelector(sel)
      return !!e && getComputedStyle(e).display !== 'none'
    }
    // A4 at 96 dpi, less the 14mm @page margins either side.
    const contentPx = { w: (210 - 28) / 25.4 * 96, h: (297 - 28) / 25.4 * 96 }
    const cards = [...document.querySelectorAll('.card')].map((c) => ({
      h: c.getBoundingClientRect().height,
      right: c.getBoundingClientRect().right,
    }))
    return {
      headerVisible: vis('.app-header'),
      breadcrumbVisible: vis('.breadcrumb'),
      buttonVisible: vis('.print-button'),
      mastheadVisible: vis('.print-masthead'),
      footVisible: vis('.print-foot'),
      mastheadText: document.querySelector('.print-masthead')?.textContent ?? '',
      footText: document.querySelector('.print-foot')?.textContent ?? '',
      badgeBorder: (() => {
        const b = document.querySelector('.badge')
        return b ? getComputedStyle(b).borderTopWidth : ''
      })(),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      textColor: getComputedStyle(document.querySelector('.page-title')).color,
      docWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.getBoundingClientRect().width,
      tallestCard: Math.max(...cards.map((c) => c.h)),
      pageHeightPx: contentPx.h,
      overflowing: cards.filter((c) => c.right > document.body.getBoundingClientRect().right + 1).length,
      heroText: document.querySelector('.hero-value')?.textContent ?? '',
      idText: [...document.querySelectorAll('.meta-value')].map((e) => e.textContent.trim()),
    }
  }`)

  check('app header is not printed', !printed.headerVisible, '')
  check('breadcrumb is not printed', !printed.breadcrumbVisible, '')
  check('the print button does not print itself', !printed.buttonVisible, '')
  check('printed page carries a masthead naming the document', printed.mastheadVisible &&
    printed.mastheadText.includes(reportA.report_id), printed.mastheadText)
  check('printed page carries a footer with the verdict figures', printed.footVisible &&
    printed.footText.includes(reportA.report_id), printed.footText.trim().slice(0, 90))
  check('paper background is white', printed.bodyBg === 'rgb(255, 255, 255)', printed.bodyBg)
  check('body text is pure black on paper', printed.textColor === 'rgb(0, 0, 0)', printed.textColor)
  check('the verdict badge survives a printer that drops backgrounds',
    parseFloat(printed.badgeBorder) >= 1, `border ${printed.badgeBorder}`)
  check('the headline figure is still on the printed page',
    printed.heroText.startsWith(tonnes(reportA.co2_sequestered_kg)), printed.heroText)
  check('the report id is still on the printed page',
    printed.idText.includes(reportA.report_id), '')
  check('nothing overflows the printable width', printed.overflowing === 0,
    `${printed.overflowing} element(s) past the page edge`)
  check('no card is taller than one page, so none can split across the break',
    printed.tallestCard <= printed.pageHeightPx,
    `tallest ${Math.round(printed.tallestCard)}px vs page ${Math.round(printed.pageHeightPx)}px`)

  // --- 9. the actual PDF ---------------------------------------------------
  heading('9. The exported PDF itself')

  await page.setMedia(null)
  const pdf = await page.pdf()
  const raw = pdf.toString('latin1')

  check('Chrome produced a PDF', raw.startsWith('%PDF-'), raw.slice(0, 8))
  check('the PDF is complete', raw.trimEnd().endsWith('%%EOF'), '')
  check('the PDF is not a blank page', pdf.length > 20_000, `${Math.round(pdf.length / 1024)} kB`)

  const count = Number(raw.match(/\/Count\s+(\d+)/)?.[1] ?? 0)
  check('page count is bounded — a report, not a print-out of the app',
    count >= 1 && count <= 2, `${count} page(s)`)

  const box = raw.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/)
  const [w, h] = [Math.round(Number(box?.[1])), Math.round(Number(box?.[2]))]
  check('the CSS @page size reached the PDF (A4 portrait)',
    Math.abs(w - A4_PT.w) <= 2 && Math.abs(h - A4_PT.h) <= 2,
    `${w}x${h}pt, want ~${A4_PT.w}x${A4_PT.h}pt`)

  // Printing must not itself be a source of errors — a print stylesheet that
  // throws a layout warning would show up here.
  check('printing produced no console errors', page.problems.length === 0,
    page.problems.slice(0, 4).join(' | '))

  // A flagged site must export just as cleanly; this is the document a reviewer
  // is most likely to actually open.
  await page.goto(`${base}/#/site/${siteB.site_id}/report`,
    `() => document.querySelector('.hero-value') !== null`, 'site B report')
  const pdfB = await page.pdf()
  const rawB = pdfB.toString('latin1')
  check('the flagged site exports a valid PDF too',
    rawB.startsWith('%PDF-') && rawB.trimEnd().endsWith('%%EOF') && pdfB.length > 20_000,
    `${Math.round(pdfB.length / 1024)} kB`)
  check('the two reports are different documents', pdf.length !== pdfB.length,
    `${Math.round(pdf.length / 1024)} kB vs ${Math.round(pdfB.length / 1024)} kB`)

  await cleanup()
}

finish('Phase 5 gate', main)
