#!/usr/bin/env node
/**
 * Phase 6 gate — Testing & Deployment (prd.md §11).
 *
 * The three checklist items:
 *   1. Full user journey (site list -> site detail -> verification status ->
 *      export) works on the deployed link.
 *   2. Tested on at least one device/browser outside the dev machine.
 *   3. No broken links, no dev-only debug output visible.
 *
 * Two things make this gate different from the Phase 4 and Phase 5 ones.
 *
 * **It tests the deployed topology, not the dev topology.** Those gates put a
 * Vite preview server in front of the backend and let it proxy `/api`. That
 * proxy does not exist in production: one uvicorn process serves the API *and*
 * the built SPA from one origin. A route that only works through the dev proxy
 * is precisely the bug that ships, so nothing here runs through Vite.
 *
 * **It can be aimed at a running deployment.** `--target <url>` skips the build
 * and runs every check against a URL instead -- the Docker image locally, and
 * then the Render link itself. Checklist item 1 says "works on the deployed
 * link", and the only honest way to check that is to check the deployed link.
 *
 * Item 2 cannot be finished by a gate: emulating a phone viewport in headless
 * Chrome is not the same as a real device on real wifi, and pretending
 * otherwise would be the exact unchecked claim this project exists to argue
 * against. What runs here is the part that *can* be automated -- no horizontal
 * overflow, legible type, working layout at phone and tablet widths -- and the
 * real-device pass stays a human step, recorded in prd.md when it is done.
 *
 * Run:  node verify_phase6.mjs
 *       node verify_phase6.mjs --target http://127.0.0.1:8123
 *       node verify_phase6.mjs --target https://<service>.onrender.com
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

import {
  BACKEND, ROOT, STATUS_LABEL, bootSingleOrigin, check, eq, finish, heading, kg,
  openBrowser, tonnes,
} from './verify_lib.mjs'

const argv = process.argv.slice(2)
const targetIdx = argv.indexOf('--target')
const TARGET = targetIdx > -1 ? (argv[targetIdx + 1] ?? '').replace(/\/+$/, '') : null

const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const has = (p) => existsSync(join(ROOT, p))

/** Fetch text with the status, so a check can report either. */
async function grab(url) {
  const res = await fetch(url)
  return { status: res.status, type: res.headers.get('content-type') ?? '', text: await res.text() }
}

async function main() {
  // ----------------------------------------------------- 1. deploy artifacts
  heading('1. Deployment artifacts are coherent')

  check('Dockerfile exists', has('Dockerfile'))
  const dockerfile = has('Dockerfile') ? read('Dockerfile') : ''

  check('build is multi-stage — Node builds, Python runs',
    /FROM\s+node:\S+\s+AS\s+web/i.test(dockerfile) && /FROM\s+python:/i.test(dockerfile),
    'a Node toolchain in the runtime image is 300MB nobody serves')
  check('installs from the lockfile (npm ci, not npm install)',
    /RUN\s+npm\s+ci\b/.test(dockerfile) && !/RUN\s+npm\s+install\b/.test(dockerfile))
  check('build output is copied where app.py looks for it',
    /COPY\s+--from=web\s+\/web\/dist\s+\.\/backend\/static/.test(dockerfile))
  // Scoped to the CMD line, not the whole file: an earlier draft of these two
  // checks passed against the *comment* that explains why they matter, which is
  // the most embarrassing way for a gate to be vacuous.
  const cmdLine = (dockerfile.match(/^CMD\s+.*$/m) ?? [''])[0]
  check('the image has a CMD', cmdLine.length > 0, cmdLine)
  check('server binds 0.0.0.0, not loopback',
    /--host\s+0\.0\.0\.0/.test(cmdLine),
    'a container bound to 127.0.0.1 is unreachable from outside it')
  check('honours the $PORT the host injects',
    /\$\{?PORT/.test(cmdLine),
    'Render assigns the port; a hard-coded one is marked unhealthy forever')

  check('.dockerignore exists', has('.dockerignore'))
  const dockerignore = has('.dockerignore') ? read('.dockerignore') : ''
  check('.dockerignore excludes the virtualenv',
    /\.venv/.test(dockerignore),
    'a Windows venv copied into a Linux image is a silent breakage')
  check('.dockerignore excludes node_modules', /node_modules/.test(dockerignore))
  check('.dockerignore excludes frontend/dist',
    /frontend\/dist/.test(dockerignore),
    'the image must build the frontend, not inherit whatever was last built here')

  check('render.yaml exists', has('render.yaml'))
  const render = has('render.yaml') ? read('render.yaml') : ''
  check('render.yaml declares a docker web service',
    /type:\s*web/.test(render) && /runtime:\s*docker/.test(render))
  check('render.yaml points at a Dockerfile that exists',
    has((render.match(/dockerfilePath:\s*\.?\/?(\S+)/) ?? [, ''])[1]))
  check('health check is /health, not /',
    /healthCheckPath:\s*\/health/.test(render),
    '/ answers even when the frontend build is missing — it cannot detect that')
  check('deploys on the free plan', /plan:\s*free/.test(render))

  const appPy = readFileSync(join(BACKEND, 'app.py'), 'utf8')
  check('app.py looks for the image path and the local build path',
    appPy.includes('"static"') && appPy.includes('"dist"'),
    'both arrangements must work: the container and a local production run')
  check('the static mount is registered after the API router',
    appPy.indexOf('include_router') < appPy.indexOf('app.mount'),
    'otherwise a mistyped /api path answers with HTML instead of a JSON 404')

  // The bug that cost this phase its first Docker build: the lockfile resolved
  // every package to a corporate Nexus mirror inherited from the machine's
  // ~/.npmrc. It installs fine here and 401s in every build that is not here.
  const lock = read('frontend/package-lock.json')
  check('lockfile resolves to the public registry only',
    !/nexus\.|artifactory|\.internal\//i.test(lock) && lock.includes('registry.npmjs.org'),
    'a private mirror in the lockfile builds on this machine and nowhere else')
  check('frontend/.npmrc pins the public registry',
    has('frontend/.npmrc') && /registry\s*=\s*https:\/\/registry\.npmjs\.org/.test(read('frontend/.npmrc')),
    'stops the next npm install from re-pointing the lockfile at the mirror')

  // -------------------------------------------------------------- 2. serving
  heading('2. One origin serves the API and the app')

  let base = TARGET
  if (TARGET) {
    check('running against a deployment', true, TARGET)
  } else {
    const booted = await bootSingleOrigin()
    base = booted.base
  }

  const root = await grab(`${base}/`)
  eq('GET / is 200', root.status, 200)
  check('GET / is HTML', root.type.includes('text/html'), root.type)
  check('served page is the SPA shell', root.text.includes('<div id="root">'))
  check('page has a real title', /<title>[^<]{4,}<\/title>/.test(root.text),
    (root.text.match(/<title>([^<]*)<\/title>/) ?? [, ''])[1])

  const health = await grab(`${base}/health`)
  eq('GET /health is 200', health.status, 200)
  check('health payload is the liveness contract',
    JSON.parse(health.text).status === 'ok', health.text)

  const ping = await grab(`${base}/api/ping`)
  eq('GET /api/ping is 200 on the same origin', ping.status, 200)
  check('no proxy involved — the API answers from the page origin',
    JSON.parse(ping.text).message === 'pong', ping.text)

  const sites = JSON.parse((await grab(`${base}/api/sites?range=6w`)).text)
  check('GET /api/sites returns the demo sites', Array.isArray(sites) && sites.length >= 2,
    `${sites.length} sites`)

  const strayApi = await grab(`${base}/api/not-a-route`)
  eq('an unknown /api path is 404', strayApi.status, 404)
  check('...and answers JSON, not the SPA shell',
    strayApi.type.includes('json') && !strayApi.text.includes('<div id="root">'),
    strayApi.type)
  const strayFile = await grab(`${base}/not-a-file.txt`)
  eq('an unknown static path is 404, not a silent 200', strayFile.status, 404)

  const favicon = await grab(`${base}/favicon.svg`)
  eq('favicon is served', favicon.status, 200)

  // ------------------------------------------------------- 3. shipped bundle
  heading('3. The shipped bundle carries no dev-only output (checklist item 3)')

  const assetPaths = [...root.text.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
  check('index.html references hashed build assets', assetPaths.length >= 2,
    assetPaths.join(' '))
  check('no Vite dev client in the served HTML',
    !root.text.includes('/@vite/client') && !root.text.includes('/src/main.jsx'),
    'that string means an unbuilt index.html was deployed')

  let totalGzip = 0
  for (const path of assetPaths) {
    const name = path.split('/').pop()
    const asset = await grab(`${base}${path}`)
    eq(`asset ${name} is served`, asset.status, 200)
    totalGzip += gzipSync(Buffer.from(asset.text)).length

    check(`${name}: no console.log left in`, !/console\.log\s*\(/.test(asset.text))
    check(`${name}: no debugger statement`, !/\bdebugger\b/.test(asset.text))
    check(`${name}: no sourcemap shipped`, !asset.text.includes('sourceMappingURL'),
      'a sourcemap publishes the unminified source and every comment in it')
    check(`${name}: no dev hostname baked in`, !/localhost:\d|127\.0\.0\.1:\d/.test(asset.text),
      'the API client must stay on relative /api paths')
    check(`${name}: no internal infrastructure named`, !/nexus\.|\.iqm\.|artifactory/i.test(asset.text))
    check(`${name}: no react-refresh runtime`, !asset.text.includes('react-refresh'),
      'that string is a dev-mode build giveaway')
  }
  for (const path of assetPaths) {
    const map = await grab(`${base}${path}.map`)
    eq(`${path.split('/').pop()}.map is not downloadable`, map.status, 404)
  }

  // The bundle-size warning Vite prints was deferred out of Phase 5. The number
  // that matters on venue wifi is the transferred one, not the raw one.
  check('total gzipped payload stays under 220 kB', totalGzip < 220_000,
    `${(totalGzip / 1024).toFixed(0)} kB gzipped over the wire`)

  // -------------------------------------------------------------- 4. journey
  heading('4. The full journey works by clicking, not by typing URLs (item 1)')

  const { page, cleanup } = await openBrowser()
  const siteA = sites[0]

  await page.goto(`${base}/#/`, `() => document.querySelectorAll('.site-card').length > 0`,
    'site cards')
  const cards = await page.evaluate(`() => [...document.querySelectorAll('.site-card')].map((c) => ({
    name: c.querySelector('.site-name')?.textContent ?? '',
    badge: c.querySelector('.badge')?.textContent?.trim() ?? '',
    href: c.getAttribute('href'),
  }))`)
  eq('overview lists every site the API returns', cards.length, sites.length)
  eq('first card names the first site', cards[0].name, siteA.name)
  eq('first card carries its verdict', cards[0].badge, STATUS_LABEL[siteA.status])

  // Click, not navigate: the checklist item is that the *link* works.
  await page.evaluate(`() => { document.querySelectorAll('.site-card')[0].click(); return true }`)
  await page.waitFor(`() => document.querySelectorAll('.recharts-line-curve').length >= 2`,
    20_000, 'site detail after clicking the card')
  const detail = await page.evaluate(`() => ({
    title: document.querySelector('.page-title')?.textContent ?? '',
    hash: location.hash,
    verdict: document.querySelector('.verdict .badge')?.textContent?.trim() ?? '',
    explanation: document.querySelector('.explanation')?.textContent ?? '',
    lines: document.querySelectorAll('.recharts-line-curve').length,
    figure: [...document.querySelectorAll('.tile')]
      .map((t) => t.querySelector('.tile-value')?.textContent ?? '').join('|'),
  })`)
  eq('clicking a card lands on that site', detail.title, siteA.name)
  eq('the hash route is the deep link', detail.hash, `#/site/${siteA.site_id}`)
  eq('verification panel shows the same verdict as the card',
    detail.verdict, STATUS_LABEL[siteA.status])
  check('the panel explains the verdict', detail.explanation.length > 20, detail.explanation)
  check('both signals are drawn', detail.lines >= 2, `${detail.lines} lines`)
  // The detail tile states kilograms; only the report hero rounds to tonnes.
  check('the CO2 figure is on screen', detail.figure.includes(kg(siteA.co2_sequestered_kg)),
    detail.figure)

  await page.evaluate(`() => { document.querySelector("a[href$='/report']").click(); return true }`)
  await page.waitFor(`() => document.querySelector('.hero-value') !== null`, 20_000, 'report')
  const report = JSON.parse((await grab(`${base}/api/sites/${siteA.site_id}/report?range=6w`)).text)
  const view = await page.evaluate(`() => ({
    hero: document.querySelector('.hero-value')?.textContent ?? '',
    heroFoot: document.querySelector('.tile-foot')?.textContent ?? '',
    badge: document.querySelector('.report-head .badge')?.textContent?.trim() ?? '',
    ids: [...document.querySelectorAll('.mono')].map((n) => n.textContent.trim()),
    hasPrintButton: !!document.querySelector('.print-button'),
  })`)
  check('the report link reaches the report', view.hero.length > 0, view.hero)
  check('report headline matches the API figure',
    view.hero.startsWith(tonnes(report.co2_sequestered_kg)),
    `${view.hero} vs ${tonnes(report.co2_sequestered_kg)}`)
  check('report headline agrees with the card that led here',
    tonnes(report.co2_sequestered_kg) === tonnes(siteA.co2_sequestered_kg),
    `report ${report.co2_sequestered_kg} / overview ${siteA.co2_sequestered_kg}`)
  check('exact kilograms are stated too', view.heroFoot.includes(kg(report.co2_sequestered_kg)),
    view.heroFoot)
  eq('report verdict matches the journey', view.badge, STATUS_LABEL[report.status])
  check('the report id from the API is on the page',
    view.ids.some((t) => t.includes(report.report_id)), view.ids.join(' '))
  check('the export control is present', view.hasPrintButton)

  // Export is the last step of the journey and the artifact a verifier keeps,
  // so it is rendered through the browser's real print pipeline here too — on
  // the server arrangement that is actually deployed.
  const pdf = await page.pdf()
  check('export produces a valid PDF on the deployed build',
    pdf.subarray(0, 5).toString() === '%PDF-' && pdf.includes('%%EOF'),
    `${(pdf.length / 1024).toFixed(0)} kB`)
  const box = pdf.toString('latin1').match(/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/)
  check('exported page is A4',
    !!box && Math.round(+box[1]) === 595 && Math.round(+box[2]) === 842,
    box ? `${Math.round(+box[1])}x${Math.round(+box[2])}pt` : 'no MediaBox')

  await page.evaluate(`() => { document.querySelector('.breadcrumb').click(); return true }`)
  await page.waitFor(`() => location.hash === '#/site/${siteA.site_id}'`, 20_000, 'back to detail')
  check('the breadcrumb returns to the site', true, `#/site/${siteA.site_id}`)
  await page.evaluate(`() => { document.querySelector('.brand').click(); return true }`)
  await page.waitFor(`() => document.querySelectorAll('.site-card').length > 0`, 20_000, 'overview')
  check('the brand returns to the overview', true)

  check('the browser reported nothing wrong across the whole journey',
    page.problems.length === 0, page.problems.join(' | '))

  // ---------------------------------------------------------------- 5. links
  heading('5. No broken links (checklist item 3)')

  const SCREENS = [
    ['overview', '#/', `() => document.querySelectorAll('.site-card').length > 0`],
    ['detail', `#/site/${siteA.site_id}`, `() => document.querySelectorAll('.recharts-line-curve').length >= 2`],
    ['report', `#/site/${siteA.site_id}/report`, `() => document.querySelector('.hero-value') !== null`],
  ]

  const routes = new Set()
  const anchors = []
  for (const [label, hash, ready] of SCREENS) {
    await page.goto(`${base}/${hash}`, ready, label)
    const found = await page.evaluate(`() => [...document.querySelectorAll('a')].map((a) => ({
      href: a.getAttribute('href'), text: a.textContent.trim().slice(0, 40),
      target: a.getAttribute('target'), rel: a.getAttribute('rel'),
    }))`)
    check(`${label}: page has links`, found.length > 0, `${found.length} anchors`)
    for (const a of found) {
      anchors.push({ label, ...a })
      if (a.href?.startsWith('#')) routes.add(a.href)
    }
    check(`${label}: loading it cold renders without error`,
      page.problems.length === 0, page.problems.join(' | '))
  }

  check('no dead or placeholder hrefs anywhere',
    anchors.every((a) => a.href && a.href !== '#' && !/^javascript:/.test(a.href)),
    anchors.filter((a) => !a.href || a.href === '#').map((a) => a.text).join(', '))
  check('every link is an internal hash route',
    anchors.every((a) => a.href.startsWith('#')),
    anchors.filter((a) => !a.href.startsWith('#')).map((a) => a.href).join(', '))
  check('nothing opens a new tab without rel protection',
    anchors.every((a) => a.target !== '_blank' || /noopener|noreferrer/.test(a.rel ?? '')))
  check('collected the routes the UI actually links to', routes.size >= 3, [...routes].join(' '))

  // Each destination is loaded cold — a fresh page load, not a client-side hash
  // change — because that is what happens when a judge pastes the link or hits
  // refresh on the deployed site.
  for (const route of routes) {
    await page.goto(`${base}/${route}`,
      `() => document.querySelector('.page-title') !== null || document.querySelector('.hero-value') !== null`,
      `cold load of ${route}`)
    const state = await page.evaluate(`() => ({
      error: document.querySelector('.state-error')?.textContent ?? '',
      blank: (document.querySelector('#root')?.children.length ?? 0) === 0,
    })`)
    check(`${route} survives a cold load`, !state.error && !state.blank,
      state.error || (state.blank ? 'empty #root' : ''))
    check(`${route} loads without a browser complaint`, page.problems.length === 0,
      page.problems.join(' | '))
  }

  // -------------------------------------------------- 6. small-screen layout
  heading('6. Small screens (checklist item 2 — the automatable part)')

  for (const [device, width, height] of [['phone', 390, 844], ['tablet', 768, 1024]]) {
    await page.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 2, mobile: device === 'phone',
    })
    for (const [label, hash, ready] of SCREENS) {
      await page.goto(`${base}/${hash}`, ready, `${device} ${label}`)
      const layout = await page.evaluate(`() => {
        const spill = [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
          .map((el) => String(el.className || el.tagName)).slice(0, 4)
        return {
          docWidth: document.documentElement.scrollWidth,
          winWidth: window.innerWidth,
          spill,
          bodyFont: parseFloat(getComputedStyle(document.body).fontSize),
          headerVisible: (document.querySelector('.app-header')?.getBoundingClientRect().height ?? 0) > 0,
        }
      }`)
      check(`${device}/${label}: no horizontal scroll`,
        layout.docWidth <= layout.winWidth + 1,
        `${layout.docWidth}px in a ${layout.winWidth}px viewport`)
      check(`${device}/${label}: nothing spills past the viewport`,
        layout.spill.length === 0, layout.spill.join(', '))
      check(`${device}/${label}: body type is readable`, layout.bodyFont >= 14,
        `${layout.bodyFont}px`)
      check(`${device}/${label}: the header is still there`, layout.headerVisible)
    }
  }
  await page.send('Emulation.clearDeviceMetricsOverride')

  heading('7. Standing reminder')
  check('a real device pass is a human step, not a gate result', true,
    'emulation is not a phone on venue wifi — record the real-device pass in prd.md')

  await cleanup()
}

finish(TARGET ? `PHASE 6 GATE (${TARGET})` : 'PHASE 6 GATE', main)
