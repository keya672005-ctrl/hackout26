/**
 * Shared harness for the frontend phase gates (Phase 4 dashboard, Phase 5
 * report export).
 *
 * Extracted when Phase 5 needed the same browser driver: two copies of a CDP
 * client would drift, and the second copy is where the bug hides.
 *
 * What it provides, and the reasoning behind each piece:
 *
 * - `boot()` builds the frontend and starts **its own backend on a free port**,
 *   pointing the preview build at it via `API_TARGET`. Phase 4 was lost for a
 *   while to a stale uvicorn holding :8000 and answering with old code, so no
 *   gate here trusts a server it did not start.
 * - The browser is real Chrome over the DevTools Protocol, with no dependency:
 *   Chrome ships with the OS and Node 22 has a global `WebSocket`. Installing
 *   Playwright on hackathon wifi is not a plan.
 * - Display formatters are re-implemented here rather than imported from
 *   `src/lib/format.js`. A gate that imports the code under test can only prove
 *   that code is self-consistent.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)))
export const ROOT = resolve(FRONTEND, '..')
export const BACKEND = join(ROOT, 'backend')
export const isWindows = process.platform === 'win32'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- reporting

let passed = 0
const failures = []
let group = ''

export const heading = (t) => {
  group = t
  console.log(`\n\x1b[1m${t}\x1b[0m`)
}

export function check(name, ok, detail = '') {
  if (ok) {
    passed += 1
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}${detail ? `  \x1b[2m${detail}\x1b[0m` : ''}`)
  } else {
    failures.push(`${group} / ${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? `  ${detail}` : ''}`)
  }
}

export const eq = (name, actual, expected) =>
  check(name, actual === expected,
    `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)

/** Wrap a gate's body so pass/fail reporting and teardown are identical. */
export function finish(label, body) {
  body()
    .then(() => {
      console.log(`\n${'-'.repeat(64)}`)
      if (failures.length) {
        console.log(`\x1b[31m${label} FAILED\x1b[0m — ${passed} passed, ${failures.length} failed:`)
        for (const f of failures) console.log(`  · ${f}`)
        killAll()
        process.exit(1)
      }
      console.log(`\x1b[32m${label} PASSED\x1b[0m — all ${passed} checks pass.`)
      killAll()
      process.exit(0)
    })
    .catch((err) => {
      console.error(`\n\x1b[31m${label} ERRORED\x1b[0m — ${err.message}`)
      console.error(err.stack)
      killAll()
      process.exit(1)
    })
}

// ---------------------------------------------------------------- processes

const children = []

export function run(command, args, opts = {}) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false, ...opts })
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.log = ''
  child.stdout.on('data', (c) => { child.log += c })
  child.stderr.on('data', (c) => { child.log += c })
  children.push(child)
  return child
}

export const waitExit = (child) => new Promise((res) => child.on('exit', res))

export function killAll() {
  for (const c of children) {
    if (c.killed || c.exitCode !== null) continue
    try {
      // Uvicorn's reloader and Chrome both leave grandchildren that inherit the
      // listening socket; on Windows only taskkill /T reliably takes the tree.
      if (isWindows) spawn('taskkill', ['/pid', String(c.pid), '/f', '/t'], { stdio: 'ignore' })
      else process.kill(-c.pid, 'SIGKILL')
    } catch {
      try { c.kill('SIGKILL') } catch { /* already gone */ }
    }
  }
}

export function freePort() {
  return new Promise((res, rej) => {
    const s = createServer()
    s.once('error', rej)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => res(port))
    })
  })
}

export async function waitForHttp(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url)
      if (r.ok) return true
    } catch { /* not up yet */ }
    await sleep(250)
  }
  throw new Error(`${label} did not come up at ${url} within ${timeoutMs}ms`)
}

export const pythonPath = () =>
  join(BACKEND, '.venv', isWindows ? 'Scripts' : 'bin', isWindows ? 'python.exe' : 'python')

const viteBin = () => join(FRONTEND, 'node_modules', 'vite', 'bin', 'vite.js')

/**
 * Build the frontend, start a private backend, serve the built bundle.
 * Returns the preview base URL, the API port and a JSON helper.
 */
export async function boot({ lint = true } = {}) {
  const apiPort = await freePort()
  const webPort = await freePort()

  const python = pythonPath()
  check('backend virtualenv present', existsSync(python), python)

  const build = run(process.execPath, [viteBin(), 'build'], { cwd: FRONTEND })
  const buildCode = await waitExit(build)
  check('production build succeeds', buildCode === 0, buildCode === 0 ? '' : build.log.slice(-1500))
  if (buildCode !== 0) throw new Error('build failed — nothing to verify')

  if (lint) {
    const l = run(process.execPath, [join(FRONTEND, 'node_modules', 'oxlint', 'bin', 'oxlint'), 'src'],
      { cwd: FRONTEND })
    const lintCode = await waitExit(l)
    check('lint is clean', lintCode === 0, lintCode === 0 ? '' : l.log.slice(-1200))
  }

  run(python, ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', String(apiPort)],
    { cwd: BACKEND })
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/ping`, 30_000, 'backend')
  check('backend started on its own free port', true,
    `:${apiPort} — not trusting whatever holds :8000`)

  // `--host 127.0.0.1` is not optional: left to itself `vite preview` binds ::1
  // only, so every IPv4 probe here would time out against a running server.
  run(process.execPath, [viteBin(), 'preview', '--host', '127.0.0.1',
    '--port', String(webPort), '--strictPort'],
  { cwd: FRONTEND, env: { ...process.env, API_TARGET: `http://127.0.0.1:${apiPort}` } })
  const base = `http://127.0.0.1:${webPort}`
  await waitForHttp(`${base}/`, 30_000, 'preview server')
  check('built bundle served, /api proxied to that backend', true, base)

  const api = (p) => fetch(`${base}${p}`).then(async (r) => {
    if (!r.ok) throw new Error(`${p} -> ${r.status}`)
    return r.json()
  })

  return { base, apiPort, webPort, api }
}

/**
 * Boot the **deployed** shape instead of the dev shape: one origin, uvicorn
 * serving the API *and* the built SPA, with no Vite and no proxy anywhere.
 *
 * `boot()` above is honest about the dev-time topology, but it is not what
 * Phase 6 ships -- it puts a Vite preview server in front of the backend, and a
 * proxy that only exists on this machine is exactly the kind of thing that
 * works locally and 404s in production. This starts the same process Render
 * starts, so mount order, asset paths and same-origin `/api` calls are proven
 * in the arrangement they will actually run in.
 *
 * `STATIC_DIR` points the backend at `frontend/dist`; in the image the build is
 * copied to `backend/static/` instead, which is the other candidate app.py
 * checks. Both paths are exercised: this gate runs the first, and the same gate
 * pointed at the running container with `--target` runs the second.
 */
export async function bootSingleOrigin({ lint = true } = {}) {
  const port = await freePort()
  const python = pythonPath()
  check('backend virtualenv present', existsSync(python), python)

  const build = run(process.execPath, [viteBin(), 'build'], { cwd: FRONTEND })
  const buildCode = await waitExit(build)
  check('production build succeeds', buildCode === 0, buildCode === 0 ? '' : build.log.slice(-1500))
  if (buildCode !== 0) throw new Error('build failed -- nothing to verify')

  if (lint) {
    const l = run(process.execPath, [join(FRONTEND, 'node_modules', 'oxlint', 'bin', 'oxlint'), 'src'],
      { cwd: FRONTEND })
    const lintCode = await waitExit(l)
    check('lint is clean', lintCode === 0, lintCode === 0 ? '' : l.log.slice(-1200))
  }

  run(python, ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', String(port)],
    { cwd: BACKEND, env: { ...process.env, STATIC_DIR: join(FRONTEND, 'dist') } })
  const base = `http://127.0.0.1:${port}`
  await waitForHttp(`${base}/health`, 30_000, 'single-origin server')
  check('one process serves API and frontend together', true, `${base} -- no proxy in front`)

  return { base, port }
}

// -------------------------------------------------- chrome devtools protocol

export function chromePath() {
  const candidates = isWindows
    ? [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      ]
    : [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      ]
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error('no Chrome/Edge binary found — these gates need one')
  return found
}

export class Page {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    // Everything the browser complained about since the last reset.
    this.problems = []
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: res, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : res(msg.result)
        return
      }
      this.#event(msg)
    })
  }

  #event(msg) {
    const { method, params } = msg
    if (method === 'Runtime.consoleAPICalled' && (params.type === 'error' || params.type === 'assert')) {
      const text = (params.args ?? [])
        .map((a) => a.value ?? a.description ?? a.unserializableValue ?? '')
        .join(' ')
        .trim()
      this.problems.push(`console.${params.type}: ${text.slice(0, 300)}`)
    }
    if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails
      this.problems.push(`uncaught: ${d.exception?.description ?? d.text}`.slice(0, 300))
    }
    if (method === 'Log.entryAdded' && params.entry.level === 'error') {
      this.problems.push(`log: ${params.entry.text}`.slice(0, 300))
    }
    if (method === 'Network.responseReceived' && params.response.status >= 400) {
      this.problems.push(`HTTP ${params.response.status} ${params.response.url}`)
    }
    if (method === 'Network.loadingFailed' && !params.canceled) {
      this.problems.push(`request failed: ${params.errorText}`)
    }
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.delete(id)) rej(new Error(`${method} timed out`))
      }, 30_000)
    })
  }

  reset() { this.problems = [] }

  async evaluate(fnSource) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(${fnSource})()`,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    }
    return r.result.value
  }

  /** Poll until the page reports it is ready, so no check races the render. */
  async waitFor(fnSource, timeoutMs = 20_000, label = 'condition') {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate(fnSource)) return
      } catch { /* mid-navigation */ }
      await sleep(120)
    }
    throw new Error(`timed out waiting for ${label}`)
  }

  async goto(url, readySource, label) {
    this.reset()
    await this.send('Page.navigate', { url })
    await this.waitFor(readySource, 20_000, label)
    // Recharts renders on a resize-observer tick; give the frame a beat so a
    // half-drawn chart is never what gets measured.
    await sleep(400)
  }

  /** Switch the page between screen and print rendering. */
  setMedia(media) {
    return this.send('Emulation.setEmulatedMedia', media ? { media } : {})
  }

  /** Render to PDF exactly as the browser's "Save as PDF" would. */
  async pdf(opts = {}) {
    const { data } = await this.send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      ...opts,
    })
    return Buffer.from(data, 'base64')
  }
}

export async function openBrowser() {
  const port = await freePort()
  const userDataDir = mkdtempSync(join(tmpdir(), 'gate-'))
  run(chromePath(), [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--window-size=1440,2400',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ])

  const deadline = Date.now() + 30_000
  let target = null
  while (Date.now() < deadline && !target) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
    } catch { /* not up yet */ }
    if (!target) await sleep(250)
  }
  if (!target) throw new Error('Chrome did not expose a debugging target')

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', () => rej(new Error('could not attach to Chrome')), { once: true })
  })

  const page = new Page(ws)
  await page.send('Runtime.enable')
  await page.send('Log.enable')
  await page.send('Network.enable')
  await page.send('Page.enable')

  // Chrome holds its crashpad handles until the process is gone, so the profile
  // is swept after teardown and a failure there is not a gate failure.
  const cleanup = async () => {
    killAll()
    await sleep(600)
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* temp dir */ }
  }
  return { page, cleanup }
}

// ------------------------------------------------------------- expectations
// Mirrored from src/lib/format.js on purpose — see the module docstring.

export const kg = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })
export const tonnes = (n) => (n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })
export const pct = (n, d = 1) => `${n.toFixed(d)}%`

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']
export const longDate = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

export const STATUS_LABEL = { verified: 'Verified', needs_review: 'Needs review' }
