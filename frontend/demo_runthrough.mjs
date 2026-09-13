/**
 * Timed demo run-through — Phase 7, checklist item 1.
 *
 * This is NOT the rehearsal. The checklist item is "full demo run-through
 * completed at least twice, under the judging time limit", and the thing that
 * has to fit in the limit is a *person talking* while clicking. A headless
 * browser cannot do the talking half.
 *
 * What it does measure is the floor: the seven beats of DEMO.md, driven in order
 * against a real deployment, with the wall-clock cost of every click, filter,
 * navigation and the PDF export. That number is the part of the budget the
 * software spends. Whatever is left is what the narration actually has.
 *
 * Each beat asserts that it landed before its time is recorded, so a beat that
 * silently did nothing cannot be reported as "fast".
 *
 *   node demo_runthrough.mjs                     # against the deployed link
 *   node demo_runthrough.mjs --target http://127.0.0.1:8123
 *   node demo_runthrough.mjs --runs 3 --budget 150
 */
import { openBrowser, heading, check, eq, finish, sleep, STATUS_LABEL } from './verify_lib.mjs'

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i === -1 ? fallback : process.argv[i + 1]
}
const base = arg('--target', 'https://algae-carbon-platform.onrender.com').replace(/\/$/, '')
const runs = Number(arg('--runs', '2'))
const budgetMs = Number(arg('--budget', '180')) * 1000

const api = async (path) => JSON.parse(await (await fetch(`${base}${path}`)).text())
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`

const OVERVIEW_READY = `() => document.querySelectorAll('.site-card').length > 0`
// Scope values are `all` | `region:<region>` | `operator:<operator>` — see
// src/lib/scope.js. The bare operator name stopped being a valid value when
// the facility selector grew a second axis.
const pickScope = (value) => `() => {
  const sel = document.querySelector('.select')
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
  setter.call(sel, ${JSON.stringify(value)})
  sel.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}`

async function main() {
  heading(`0. The instance is awake before the clock starts  (${base})`)

  // DEMO.md step 2 of "before you go up" is to open the link and leave it warm.
  // Timing a cold start as if it were a demo beat would measure the thing the
  // stage procedure already removes -- so it is measured, reported, and then
  // excluded from the runs.
  const wakeStart = Date.now()
  const health = await (await fetch(`${base}/health`)).json()
  const wakeMs = Date.now() - wakeStart
  eq('the service is healthy', health.status, 'ok')
  check('first byte after idle', true,
    `${secs(wakeMs)} — the free plan cold starts in 30-60s, which is why DEMO.md says open the tab first`)

  const sites = await api('/api/sites?range=6w')
  const verified = sites.find((s) => s.status === 'verified')
  const flagged = sites.find((s) => s.status === 'needs_review')
  const operators = [...new Set(sites.map((s) => s.operator))]
  eq('six blocks, as the card describes', sites.length, 6)
  check('the demo contrast exists', Boolean(verified && flagged),
    `${verified?.name} verified · ${flagged?.name} needs review`)
  check('two facilities to filter between', operators.length === 2, operators.join(' | '))

  const { page, cleanup } = await openBrowser()
  const allRuns = []

  for (let run = 1; run <= runs; run++) {
    heading(`${run}. Run-through ${run} of ${runs} — the seven beats of DEMO.md`)
    const beats = []
    const time = async (label, fn) => {
      const t0 = Date.now()
      const detail = await fn()
      const ms = Date.now() - t0
      beats.push({ label, ms })
      check(`beat ${beats.length}: ${label}`, true, `${secs(ms)}${detail ? ` — ${detail}` : ''}`)
      return ms
    }

    // A run must start where a presenter starts: a fresh load of the overview,
    // not wherever the previous run left the page.
    await time('overview — six blocks, two facilities', async () => {
      await page.goto(`${base}/#/`, OVERVIEW_READY, 'overview')
      const n = await page.evaluate(`() => document.querySelectorAll('.site-card').length`)
      if (n !== 6) throw new Error(`overview showed ${n} blocks, not 6`)
      return `${n} cards`
    })

    for (const operator of operators) {
      const expect = sites.filter((s) => s.operator === operator)
      await time(`scope to ${operator}`, async () => {
        await page.evaluate(pickScope(`operator:${operator}`))
        await page.waitFor(
          `() => document.querySelectorAll('.site-card').length === ${expect.length}`,
          10_000, `filtered to ${operator}`)
        const verdicts = await page.evaluate(
          `() => [...document.querySelectorAll('.site-card .badge')].map((b) => b.textContent.trim())`)
        const want = expect.map((s) => STATUS_LABEL[s.status])
        if (JSON.stringify(verdicts) !== JSON.stringify(want)) {
          throw new Error(`verdicts ${verdicts.join(',')} — want ${want.join(',')}`)
        }
        return `${expect.length} blocks, all "${verdicts[0]}"`
      })
    }

    await time('watchlist — tick two blocks, show the totals', async () => {
      await page.evaluate(pickScope('all'))
      await page.waitFor(`() => document.querySelectorAll('.site-card').length === 6`, 10_000, 'cleared')
      for (const id of [verified.site_id, flagged.site_id]) {
        await page.evaluate(`() => {
          document.querySelector('.watch-check[data-site=' + ${JSON.stringify(JSON.stringify(id))} + ']').click()
          return true
        }`)
      }
      await page.evaluate(`() => {
        document.querySelector('.segmented button[data-mode="watchlist"]').click()
        return true
      }`)
      await page.waitFor(`() => document.querySelectorAll('.site-card').length === 2`,
        10_000, 'watchlist view')
      const totals = await page.evaluate(`() => {
        const read = (k) => document.querySelector('[data-watch="' + k + '"]')?.textContent ?? ''
        return read('count') + ' blocks · ' + read('co2') + ' kg · '
             + read('verified') + ' verified / ' + read('flagged') + ' flagged'
      }`)
      if (!totals.startsWith('2 blocks')) throw new Error(`summary read "${totals}"`)

      // Leave the dashboard as a presenter would for the next beat, and as the
      // next run expects to find it.
      await page.evaluate(`() => { document.querySelector('.watch-clear').click(); return true }`)
      await page.evaluate(`() => {
        document.querySelector('.segmented button[data-mode="all"]').click()
        return true
      }`)
      await page.waitFor(`() => document.querySelectorAll('.site-card').length === 6`,
        10_000, 'back to all blocks')
      return totals
    })

    await time('open a verified block', async () => {
      await page.evaluate(`() => {
        const card = [...document.querySelectorAll('.site-card')]
          .find((c) => c.getAttribute('href') === '#/site/${verified.site_id}')
        card.click(); return true
      }`)
      await page.waitFor(`() => document.querySelectorAll('.recharts-line-curve').length >= 2`,
        20_000, 'both signals drawn')
      const title = await page.evaluate(`() => document.querySelector('.page-title')?.textContent ?? ''`)
      if (title !== verified.name) throw new Error(`landed on "${title}"`)
      return `${verified.name}, both signals drawn`
    })

    await time('verification panel — divergence against tolerance', async () => {
      await page.evaluate(`() => {
        document.querySelector('.gauge')?.scrollIntoView({ block: 'center' }); return true
      }`)
      // Scoped to the card that owns the gauge: `.rule-tag` also marks the
      // masthead's team tag, and an unscoped query reads that instead.
      const panel = await page.evaluate(`() => {
        const card = document.querySelector('.gauge')?.closest('.card') ?? document
        const q = (sel) => card.querySelector(sel)?.textContent?.trim() ?? ''
        return {
          title: q('.card-title'),
          rule: q('.rule-tag'),
          label: [...card.querySelectorAll('.tile-label')]
            .map((l) => l.textContent.trim()).find((t) => /tolerance/i.test(t)) ?? '',
          badge: q('.verdict .badge'),
          explanation: q('.explanation'),
          gauge: card.querySelectorAll('.gauge-fill, .gauge-limit').length,
        }
      }`)
      if (panel.title !== 'Verification') throw new Error(`panel title read "${panel.title}"`)
      if (panel.rule !== 'RULE-001') throw new Error(`rule tag read "${panel.rule}"`)
      if (panel.gauge < 2) throw new Error('gauge did not render fill + limit')
      if (panel.explanation.length < 20) throw new Error('no explanation on screen')
      return `${panel.badge} · ${panel.label}`
    })

    await time('flagged block, then the verified report, then export', async () => {
      // Both hops are hash changes, not loads: the old DOM survives, so a
      // ready-condition that only counts charts is already true and the next
      // read happens against the *previous* block. Every condition below names
      // the route it is waiting for.
      await page.goto(`${base}/#/site/${flagged.site_id}`,
        `() => location.hash === '#/site/${flagged.site_id}'
           && document.querySelector('.page-title')?.textContent === ${JSON.stringify(flagged.name)}
           && document.querySelectorAll('.recharts-line-curve').length >= 2`, 'flagged block')
      const badge = await page.evaluate(
        `() => document.querySelector('.verdict .badge')?.textContent?.trim() ?? ''`)
      if (badge !== STATUS_LABEL.needs_review) throw new Error(`flagged block read "${badge}"`)

      await page.goto(`${base}/#/site/${verified.site_id}/report`,
        `() => location.hash === '#/site/${verified.site_id}/report'
           && document.querySelector('.hero-value') !== null`, 'report')
      const id = await page.evaluate(
        `() => document.querySelector('.report-id, .mono')?.textContent?.trim() ?? ''`)

      await page.setMedia('print')
      const pdf = await page.pdf()
      await page.setMedia(null)
      if (pdf.length < 20_000) throw new Error(`PDF was only ${pdf.length} bytes`)
      return `"${badge}" shown, report ${id || '(id)'}, PDF ${(pdf.length / 1024).toFixed(0)} kB`
    })

    const total = beats.reduce((a, b) => a + b.ms, 0)
    allRuns.push({ run, beats, total })
    check(`run ${run} total click-time`, total < budgetMs,
      `${secs(total)} against a ${budgetMs / 1000}s budget — ${secs(budgetMs - total)} left for narration`)
    check('the browser reported nothing wrong during the run',
      page.problems.length === 0, page.problems.join(' | '))
    await sleep(500)
  }

  heading(`${runs + 1}. The run-throughs side by side`)
  const labels = allRuns[0].beats.map((b) => b.label)
  for (let i = 0; i < labels.length; i++) {
    const times = allRuns.map((r) => secs(r.beats[i].ms).padStart(6))
    check(`beat ${i + 1}`, true, `${times.join('  |')}   ${labels[i]}`)
  }
  const totals = allRuns.map((r) => r.total)
  check('every run fits the judging limit', totals.every((t) => t < budgetMs),
    totals.map(secs).join('  |  '))
  const spread = Math.max(...totals) - Math.min(...totals)
  check('the runs are repeatable', spread < 15_000, `spread ${secs(spread)}`)
  const worst = Math.max(...totals)
  check('narration headroom in the worst run', true,
    `${secs(budgetMs - worst)} of the ${budgetMs / 1000}s budget is free for talking`)

  heading(`${runs + 2}. Standing reminder`)
  check('a spoken run-through is a human step, not a gate result', true,
    'this measures click-time only — rehearse the words against the per-beat budget above')

  await cleanup()
}

finish(`DEMO RUN-THROUGH (${base})`, main)
