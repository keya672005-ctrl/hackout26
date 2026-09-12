#!/usr/bin/env node
/**
 * Phase 4 gate — Frontend Dashboard (prd.md §11).
 *
 * Checks the three checklist items, and nothing it cannot actually observe:
 *   1. All 3 screens load with real API data, no hard-coded frontend mocks.
 *   2. No console errors on any screen.
 *   3. Switching between demo sites updates all charts correctly.
 *
 * The browser harness, the private backend and the mirrored formatters live in
 * `verify_lib.mjs`, shared with the Phase 5 gate — see that file for why each
 * piece is built the way it is.
 *
 * Every on-screen number is compared against the API response that produced it,
 * fetched independently by this script. A screen rendering plausible figures
 * from a mock would pass a smoke test and fail here.
 *
 * Run:  node verify_phase4.mjs      (from frontend/)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
  FRONTEND, STATUS_LABEL, boot, check, eq, finish, heading, kg, openBrowser,
  pct, sleep, tonnes,
} from './verify_lib.mjs'

async function main() {
  heading('1. Build and boot')
  const { base, apiPort, api } = await boot()

  // --- 2. the backend under test answers everything the client calls -----
  heading('2. API surface the frontend depends on')

  const clientSrc = readFileSync(join(FRONTEND, 'src', 'api', 'client.js'), 'utf8')
  const paths = [...clientSrc.matchAll(/get\(\s*(?:withRange\()?\s*[`'"]([^`'"]+)/g)]
    .map((m) => m[1])
    .map((p) => p.replace(/\$\{[^}]+\}/g, '{site_id}'))
  const spec = await (await fetch(`http://127.0.0.1:${apiPort}/openapi.json`)).json()
  const registered = new Set(Object.keys(spec.paths))
  const missing = [...new Set(paths)].filter((p) => !registered.has(`/api${p}`))
  check('every path client.js calls is registered by the backend', missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : `${new Set(paths).size} paths`)

  const sites = await api('/api/sites?range=6w')
  check('at least two demo sites are served', sites.length >= 2,
    sites.map((s) => `${s.site_id}=${s.status}`).join(' '))

  const bad = []
  for (const s of sites) {
    for (const p of ['', '/readings', '/imagery-index', '/verification', '/reconciliation', '/report']) {
      for (const r of ['6w', '30d', 'all']) {
        const res = await fetch(`${base}/api/sites/${s.site_id}${p}?range=${r}`)
        if (!res.ok) bad.push(`${res.status} /api/sites/${s.site_id}${p}?range=${r}`)
      }
    }
  }
  check('every site/endpoint/range combination returns 200 through the proxy',
    bad.length === 0, bad.length ? bad.slice(0, 5).join(' | ') : `${sites.length * 18} requests`)

  // --- 3. no frontend mocks ---------------------------------------------
  heading('3. No hard-coded frontend mocks')

  const srcRoot = join(FRONTEND, 'src')
  const walk = (d, out = []) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      statSync(p).isDirectory() ? walk(p, out) : out.push(p)
    }
    return out
  }
  const files = walk(srcRoot).map((p) => [p, readFileSync(p, 'utf8')])

  const seeded = /site-a|site-b|Earthrise|Cyanotech|Spirulina|Haematococcus/
  const seedLeaks = files.filter(([, c]) => seeded.test(c)).map(([p]) => p)
  check('no seeded site id, name or species is hard-coded in src',
    seedLeaks.length === 0, seedLeaks.join(', '))

  const mockNames = files.filter(([p]) => /mock|fixture|stub|dummy|sample/i.test(p)).map(([p]) => p)
  check('no mock/fixture/stub module in src', mockNames.length === 0, mockNames.join(', '))

  const strayFetch = files
    .filter(([p, c]) => !p.endsWith(join('api', 'client.js')) && /\bfetch\s*\(/.test(c))
    .map(([p]) => p)
  check('client.js is the only module that talks to the network',
    strayFetch.length === 0, strayFetch.join(', '))

  const jsonImports = files.filter(([, c]) => /from\s+['"][^'"]+\.json['"]/.test(c)).map(([p]) => p)
  check('no bundled .json data file is imported', jsonImports.length === 0, jsonImports.join(', '))

  // --- browser ------------------------------------------------------------
  const { page, cleanup } = await openBrowser()
  const noProblems = (screen) =>
    check(`no console errors or failed requests — ${screen}`, page.problems.length === 0,
      page.problems.slice(0, 4).join(' | '))

  // A verified site and a flagged one, chosen by verdict rather than by
  // position. With six blocks in the list, sites[0] and sites[1] can easily be
  // two of the same verdict -- and the whole point of switching between them
  // here is to prove the screen re-renders a *different* verdict.
  const siteA = sites.find((s) => s.status === 'verified') ?? sites[0]
  const siteB = sites.find((s) => s.status !== siteA.status) ?? sites[1]

  // --- 4. screen 1: site overview ----------------------------------------
  heading('4. Screen 1 — Site Overview')

  await page.goto(`${base}/#/`, `() => document.querySelectorAll('.site-card').length > 0`, 'site cards')

  const cards = await page.evaluate(`() => [...document.querySelectorAll('.site-card')].map((c) => ({
    name: c.querySelector('.site-name')?.textContent ?? '',
    species: c.querySelector('.site-species')?.textContent ?? '',
    figure: c.querySelector('.site-figure-value')?.textContent ?? '',
    badge: c.querySelector('.badge')?.textContent?.trim() ?? '',
    href: c.getAttribute('href'),
    // Scoped to the card foot: the status badge is also an inline svg with a
    // path, and it sits earlier in the card.
    sparkPoints: (c.querySelector('.site-card-foot svg path')?.getAttribute('d') ?? '')
      .split(/(?=[ML])/).filter(Boolean).length,
  }))`)

  eq('one card per site returned by /api/sites', cards.length, sites.length)
  for (const [i, s] of sites.entries()) {
    eq(`card ${i + 1} name comes from the API`, cards[i]?.name, s.name)
    eq(`card ${i + 1} species comes from the API`, cards[i]?.species, s.species)
    eq(`card ${i + 1} headline CO2 matches the API figure`, cards[i]?.figure, kg(s.co2_sequestered_kg))
    eq(`card ${i + 1} badge matches the API verdict`, cards[i]?.badge, STATUS_LABEL[s.status])
    eq(`card ${i + 1} sparkline plots every trend point`, cards[i]?.sparkPoints, s.trend.length)
    eq(`card ${i + 1} links to its detail screen`, cards[i]?.href, `#/site/${s.site_id}`)
  }
  // --- 4b. the facility selector ------------------------------------------
  // Six blocks across two facilities: the control has to actually narrow the
  // grid, not merely exist. Every assertion below is against what the API said
  // belongs to that operator, so a filter that dropped or duplicated a block
  // would fail here rather than look plausible on screen.
  const operators = [...new Set(sites.map((s) => s.operator))]

  const options = await page.evaluate(`() => [...document.querySelectorAll('.select option')]
    .map((o) => ({ value: o.value, label: o.textContent }))`)
  eq('the facility selector offers every facility plus "all"', options.length, operators.length + 1)
  eq('the first option is the unfiltered view', options[0]?.value, 'all')
  check('every facility from the API is an option',
    operators.every((o) => options.some((opt) => opt.value === o)),
    options.map((o) => o.value).join(' | '))
  check('the "all" option states the block count', options[0]?.label.includes(String(sites.length)),
    options[0]?.label)

  const namesFor = (operator) => sites.filter((s) => s.operator === operator).map((s) => s.name).sort()
  const shownNames = `() => [...document.querySelectorAll('.site-name')].map((n) => n.textContent).sort()`

  for (const operator of operators) {
    // Driven the way a reader drives it: set the value and dispatch the event
    // React listens for, rather than calling the handler directly.
    await page.evaluate(`() => {
      const sel = document.querySelector('.select')
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      setter.call(sel, ${JSON.stringify(operator)})
      sel.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }`)
    const expected = namesFor(operator)
    await page.waitFor(
      `() => document.querySelectorAll('.site-card').length === ${expected.length}`,
      10_000, `filtered to ${operator}`)
    const shown = await page.evaluate(shownNames)
    check(`selecting "${operator}" shows exactly its blocks`,
      JSON.stringify(shown) === JSON.stringify(expected),
      `${shown.join(', ')}  (want ${expected.join(', ')})`)
  }

  await page.evaluate(`() => {
    const sel = document.querySelector('.select')
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    setter.call(sel, 'all')
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }`)
  await page.waitFor(`() => document.querySelectorAll('.site-card').length === ${sites.length}`,
    10_000, 'filter cleared')
  const restored = await page.evaluate(shownNames)
  check('clearing the filter restores every block',
    JSON.stringify(restored) === JSON.stringify(sites.map((s) => s.name).sort()),
    `${restored.length} blocks back`)
  noProblems('Facility filter')

  check('the two sites show different verdicts (the demo contrast is live)',
    new Set(sites.map((s) => s.status)).size === 2,
    sites.map((s) => `${s.site_id}=${s.status}`).join(' '))
  noProblems('Site Overview')

  // --- 5. screen 2: site detail -------------------------------------------
  heading('5. Screen 2 — Site Detail')

  const detailOf = async (id) => ({
    site: await api(`/api/sites/${id}`),
    readings: (await api(`/api/sites/${id}/readings?range=6w`)).series,
    imagery: (await api(`/api/sites/${id}/imagery-index?range=6w`)).series,
    verification: await api(`/api/sites/${id}/verification?range=6w`),
  })

  const readScreen = `() => {
    const tiles = [...document.querySelectorAll('.tile')].map((t) => ({
      label: t.querySelector('.tile-label')?.textContent ?? '',
      value: t.querySelector('.tile-value')?.textContent ?? '',
      badge: t.querySelector('.badge')?.textContent?.trim() ?? '',
    }))
    const table = [...document.querySelectorAll('.table-scroll tbody tr')].map((r) =>
      [...r.children].map((c) => c.textContent))
    return {
      title: document.querySelector('.page-title')?.textContent ?? '',
      sub: document.querySelector('.page-sub')?.textContent ?? '',
      eyebrow: document.querySelector('.eyebrow')?.textContent ?? '',
      headerBadge: document.querySelector('.page-head .badge')?.textContent?.trim() ?? '',
      tiles,
      panelBadge: document.querySelector('.verdict .badge')?.textContent?.trim() ?? '',
      explanation: document.querySelector('.explanation')?.textContent ?? '',
      lineCount: document.querySelectorAll('.recharts-line-curve').length,
      areaCount: document.querySelectorAll('.recharts-area-curve').length,
      curves: [...document.querySelectorAll('.recharts-line-curve, .recharts-area-curve')]
        .map((p) => p.getAttribute('d')),
      table,
    }
  }`

  const openTable = `() => { const b = [...document.querySelectorAll('.table-toggle')][0]
    if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); return true }`

  const a = await detailOf(siteA.site_id)
  await page.goto(`${base}/#/site/${siteA.site_id}`,
    `() => document.querySelectorAll('.recharts-line-curve').length >= 2`, 'reconciliation chart')
  await page.evaluate(openTable)
  await sleep(250)
  const viewA = await page.evaluate(readScreen)

  eq('site name comes from /api/sites/:id', viewA.title, a.site.name)
  eq('pond type comes from the API', viewA.eyebrow, a.site.pond_type)
  check('species and pond area come from the API',
    viewA.sub.includes(a.site.species) &&
      viewA.sub.includes(a.site.pond_area_m2.toLocaleString('en-US')),
    viewA.sub)
  eq('header badge matches the API verdict', viewA.headerBadge, STATUS_LABEL[a.site.status])

  const lastA = a.readings[a.readings.length - 1]
  const tile = (label) => viewA.tiles.find((t) => t.label.startsWith(label))
  check('"CO2 fixed this window" tile equals the last cumulative reading',
    tile('CO₂ fixed')?.value.startsWith(kg(lastA.co2_uptake_cum_kg)),
    `${tile('CO₂ fixed')?.value} vs ${kg(lastA.co2_uptake_cum_kg)}`)
  eq('"Peak divergence" tile equals the verification figure',
    tile('Peak divergence')?.value, pct(Math.abs(a.verification.divergence_pct)))
  check('"Latest biomass density" tile equals the last reading',
    tile('Latest biomass')?.value.startsWith(lastA.biomass_density_g_L.toFixed(3)),
    `${tile('Latest biomass')?.value} vs ${lastA.biomass_density_g_L.toFixed(3)}`)
  eq('verification tile badge matches the API verdict',
    tile('Verification')?.badge, STATUS_LABEL[a.verification.status])
  eq('verification panel badge matches the API verdict',
    viewA.panelBadge, STATUS_LABEL[a.verification.status])
  eq('panel explanation is the API explanation verbatim',
    viewA.explanation, a.verification.explanation)

  eq('reconciliation chart draws both series', viewA.lineCount, 2)
  eq('cumulative CO2 chart draws its series', viewA.areaCount, 1)

  const dates = [...new Set([...a.readings.map((p) => p.date), ...a.imagery.map((p) => p.date)])]
  eq('chart table has one row per date in the API series', viewA.table.length, dates.length)
  eq('satellite column carries exactly the acquisitions the API returned',
    viewA.table.filter((r) => r[2] !== '—').length, a.imagery.length)
  eq('sensor column carries exactly the days the API returned',
    viewA.table.filter((r) => r[1] !== '—').length, a.readings.length)
  check('table density values are the API readings, not a redrawn curve',
    viewA.table[0][3] === a.readings[0].biomass_density_g_L.toFixed(3),
    `${viewA.table[0][3]} vs ${a.readings[0].biomass_density_g_L.toFixed(3)}`)
  noProblems('Site Detail')

  // --- 6. screen 3: report -------------------------------------------------
  // Loads-with-real-data only; the report's own contract, fingerprint and print
  // rendering are the Phase 5 gate's job.
  heading('6. Screen 3 — Verification Report')

  const reportA = await api(`/api/sites/${siteA.site_id}/report?range=6w`)
  await page.goto(`${base}/#/site/${siteA.site_id}/report`,
    `() => document.querySelector('.hero-value') !== null`, 'report')
  const report = await page.evaluate(`() => ({
    title: document.querySelector('.page-title')?.textContent ?? '',
    hero: document.querySelector('.hero-value')?.textContent ?? '',
    heroFoot: document.querySelector('.tile-foot')?.textContent ?? '',
    rows: Object.fromEntries([...document.querySelectorAll('.meta-row')].map((r) => [
      r.querySelector('.meta-key')?.textContent ?? '',
      r.querySelector('.meta-value')?.textContent?.trim() ?? '',
    ])),
    badge: document.querySelector('.report-head .badge')?.textContent?.trim() ?? '',
    explanation: document.querySelector('.explanation')?.textContent ?? '',
  })`)

  eq('report names the site from the API', report.title, a.site.name)
  check('headline tonnage is the API figure converted',
    report.hero.startsWith(tonnes(reportA.co2_sequestered_kg)),
    `${report.hero} vs ${tonnes(reportA.co2_sequestered_kg)}`)
  check('kg subtitle agrees with the tonnage above it',
    report.heroFoot.includes(kg(reportA.co2_sequestered_kg)), report.heroFoot)
  eq('report id is the API report id', report.rows['Report ID'], reportA.report_id)
  eq('reporting period is the API period', report.rows['Reporting period'],
    reportA.reporting_period)
  check('divergence and tolerance match the verification endpoint',
    report.rows['Peak divergence vs. satellite'] ===
      `${pct(Math.abs(a.verification.divergence_pct))} (tolerance ${pct(a.verification.tolerance_pct, 0)})`,
    report.rows['Peak divergence vs. satellite'])
  eq('report verdict badge matches the API', report.badge, STATUS_LABEL[reportA.status])
  eq('report explanation is the API explanation verbatim',
    report.explanation, a.verification.explanation)
  check('report states the audited conversion factor',
    report.rows['Conversion factor']?.includes('1.8321'), report.rows['Conversion factor'])
  noProblems('Verification Report')

  // --- 7. switching sites --------------------------------------------------
  heading('7. Switching between demo sites')

  const b = await detailOf(siteB.site_id)
  await page.goto(`${base}/#/site/${siteA.site_id}`,
    `() => document.querySelectorAll('.recharts-line-curve').length >= 2`, 'site A detail')
  await page.evaluate(openTable)
  await sleep(250)
  const beforeSwitch = await page.evaluate(readScreen)

  // Navigate the way the UI does — a hash change, no reload — so this exercises
  // the refetch path rather than a fresh mount that would hide a stale-state bug.
  page.reset()
  await page.evaluate(`() => { window.location.hash = '#/site/${siteB.site_id}'; return true }`)
  await page.waitFor(
    `() => document.querySelector('.page-title')?.textContent === ${JSON.stringify(b.site.name)}`,
    20_000, 'site B title')
  await page.evaluate(openTable)
  await sleep(600)
  const afterSwitch = await page.evaluate(readScreen)

  eq('title switches to the other site', afterSwitch.title, b.site.name)
  eq('species/area line switches too', afterSwitch.eyebrow, b.site.pond_type)
  check('no value from the previous site is left on screen',
    !afterSwitch.title.includes(a.site.name) &&
      afterSwitch.tiles.every((t) =>
        !viewA.tiles.some((p) => p.value && p.value === t.value && p.label === t.label)),
    afterSwitch.tiles.map((t) => t.value).join(' | '))

  const lastB = b.readings[b.readings.length - 1]
  const tileB = (label) => afterSwitch.tiles.find((t) => t.label.startsWith(label))
  check("CO2 tile now shows site B's figure",
    tileB('CO₂ fixed')?.value.startsWith(kg(lastB.co2_uptake_cum_kg)),
    `${tileB('CO₂ fixed')?.value} vs ${kg(lastB.co2_uptake_cum_kg)}`)
  eq("divergence tile now shows site B's figure",
    tileB('Peak divergence')?.value, pct(Math.abs(b.verification.divergence_pct)))
  eq("verdict flips to site B's verdict", afterSwitch.panelBadge,
    STATUS_LABEL[b.verification.status])
  check('verdict actually changed between the two sites',
    beforeSwitch.panelBadge !== afterSwitch.panelBadge,
    `${beforeSwitch.panelBadge} -> ${afterSwitch.panelBadge}`)
  eq("explanation is site B's explanation", afterSwitch.explanation, b.verification.explanation)

  // The charts are what the checklist calls out, so they are checked as
  // geometry: every plotted curve must have been redrawn, not just relabelled.
  eq('both charts still render after the switch',
    afterSwitch.lineCount + afterSwitch.areaCount, 3)
  check('every chart curve is redrawn with new geometry',
    afterSwitch.curves.every((d, i) => d && d !== beforeSwitch.curves[i]),
    afterSwitch.curves.map((d, i) => (d === beforeSwitch.curves[i] ? `curve ${i} unchanged` : ''))
      .filter(Boolean).join(', '))

  const datesB = [...new Set([...b.readings.map((p) => p.date), ...b.imagery.map((p) => p.date)])]
  eq("chart table reloads with site B's rows", afterSwitch.table.length, datesB.length)
  eq("satellite acquisitions match site B's imagery series",
    afterSwitch.table.filter((r) => r[2] !== '—').length, b.imagery.length)
  noProblems('after switching sites')

  // --- 8. switching range --------------------------------------------------
  heading('8. Switching the reporting window')

  const b30 = {
    readings: (await api(`/api/sites/${siteB.site_id}/readings?range=30d`)).series,
    verification: await api(`/api/sites/${siteB.site_id}/verification?range=30d`),
  }
  page.reset()
  await page.evaluate(`() => {
    const btn = [...document.querySelectorAll('.segmented button')].find((b) => b.textContent.includes('30'))
    btn.click(); return true }`)
  await page.waitFor(
    `() => document.querySelector('.tile .tile-foot')?.textContent === '${b30.readings.length} days of readings'`,
    20_000, '30-day window')
  await page.evaluate(openTable)
  await sleep(600)
  const ranged = await page.evaluate(readScreen)

  const tileR = (label) => ranged.tiles.find((t) => t.label.startsWith(label))
  const lastB30 = b30.readings[b30.readings.length - 1]
  check('CO2 tile recomputes for the shorter window',
    tileR('CO₂ fixed')?.value.startsWith(kg(lastB30.co2_uptake_cum_kg)),
    `${tileR('CO₂ fixed')?.value} vs ${kg(lastB30.co2_uptake_cum_kg)}`)
  check('the window really did change the figure',
    tileR('CO₂ fixed')?.value !== tileB('CO₂ fixed')?.value,
    `${tileB('CO₂ fixed')?.value} -> ${tileR('CO₂ fixed')?.value}`)
  eq('divergence tile re-reads the 30-day verification',
    tileR('Peak divergence')?.value, pct(Math.abs(b30.verification.divergence_pct)))
  check('chart table shrinks to the shorter window',
    ranged.table.length < afterSwitch.table.length,
    `${afterSwitch.table.length} -> ${ranged.table.length} rows`)
  check('every chart curve is redrawn for the new window',
    ranged.curves.every((d, i) => d && d !== afterSwitch.curves[i]), '')
  noProblems('after switching the reporting window')

  // --- 9. failure paths ----------------------------------------------------
  heading('9. Failure paths degrade rather than crash')

  await page.goto(`${base}/#/site/does-not-exist`,
    `() => document.querySelector('.state-error') !== null || document.querySelector('.page-title') !== null`,
    'unknown site screen')
  const unknown = await page.evaluate(`() => ({
    error: document.querySelector('.state-error')?.textContent ?? '',
    crashed: document.querySelector('#root')?.children.length === 0,
  })`)
  check('an unknown site id renders an explained error, not a blank screen',
    unknown.error.includes('does-not-exist') && !unknown.crashed, unknown.error)
  check('the only browser complaint is the expected 404',
    page.problems.every((p) => p.includes('404')),
    page.problems.filter((p) => !p.includes('404')).join(' | '))

  await cleanup()
}

finish('Phase 4 gate', main)
