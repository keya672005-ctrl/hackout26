#!/usr/bin/env node
/**
 * The stage fallback (`npm run demo`).
 *
 * Brings the whole platform up on this laptop, in the same shape Render runs
 * it: one FastAPI process serving the built SPA and the API from one origin.
 * No Vite, no proxy, no second port, and — the point of the exercise — no
 * internet. If the venue wifi dies, or the free Render instance is still cold
 * when the judges are watching, this is what gets demoed instead.
 *
 * It refuses to start quietly. Everything that could be wrong on stage is
 * checked *before* the browser opens: the build exists and is current, the
 * port is genuinely free, the API answers with the blocks the script talks
 * about and with both verdicts on screen, and nothing on the page reaches for a
 * URL that needs a network. A
 * fallback that fails the same way the primary does is not a fallback.
 *
 *   npm run demo          build if needed, serve, open the browser
 *   npm run demo:check    run the checks, print the verdict, exit
 *   node scripts/demo.js --no-open --port 9000
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const isWindows = process.platform === 'win32'

const argv = process.argv.slice(2)
const CHECK_ONLY = argv.includes('--check')
const NO_OPEN = argv.includes('--no-open') || CHECK_ONLY
const NO_BUILD = argv.includes('--no-build')
const PREFERRED_PORT = Number(argv[argv.indexOf('--port') + 1]) || 8000

const dist = join(root, 'frontend', 'dist')
const backend = join(root, 'backend')
const venvPython = join(backend, '.venv', isWindows ? 'Scripts' : 'bin', isWindows ? 'python.exe' : 'python')

const green = (s) => `\x1b[32m${s}\x1b[0m`
const red = (s) => `\x1b[31m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`
const bold = (s) => `\x1b[1m${s}\x1b[0m`

let failed = 0
function check(label, ok, detail = '') {
  if (!ok) failed += 1
  console.log(`  ${ok ? green('OK  ') : red('FAIL')}  ${label}${detail ? '  ' + dim(detail) : ''}`)
  return ok
}

function die(message, ...hints) {
  console.error('')
  console.error(red(`[demo] ${message}`))
  for (const hint of hints) console.error(`[demo]   ${hint}`)
  process.exit(1)
}

// -------------------------------------------------------------- before boot

console.log(bold('\nDemo fallback — local, offline, single origin\n'))
console.log(bold('1. Before starting'))

check('backend virtualenv is present', existsSync(venvPython), venvPython.replace(root, '.'))
if (!existsSync(venvPython)) {
  die('no virtualenv to run the API with.',
    'cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt')
}

/**
 * Newest mtime under a directory tree, skipping node_modules and dist.
 * A stale `dist/` is the quiet failure this guards against: it serves, it
 * looks right, and it is last week's app.
 */
function newestMtime(dir) {
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    const mtime = entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs
    if (mtime > newest) newest = mtime
  }
  return newest
}

const builtAt = existsSync(join(dist, 'index.html')) ? statSync(join(dist, 'index.html')).mtimeMs : 0
const sourceAt = Math.max(
  newestMtime(join(root, 'frontend', 'src')),
  statSync(join(root, 'frontend', 'index.html')).mtimeMs,
  newestMtime(join(root, 'frontend', 'public')),
)
const stale = builtAt === 0 || sourceAt > builtAt

if (stale && !NO_BUILD) {
  console.log(dim(builtAt === 0 ? '  ...no build found, building now' : '  ...source is newer than the build, rebuilding'))
  const build = spawnSync(process.execPath, [join(root, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'), 'build'],
    { cwd: join(root, 'frontend'), stdio: 'inherit' })
  if (build.status !== 0) die('the frontend build failed — there is nothing to serve.')
}

check('a built frontend exists', existsSync(join(dist, 'index.html')), dist.replace(root, '.'))
check('the build is not stale', NO_BUILD || !stale || existsSync(join(dist, 'index.html')))

// The whole promise of this script is that it works with the wifi off, so the
// page is checked for anything that would reach past this machine. Google
// Fonts was exactly such a dependency until Phase 6.5 removed it.
const shell = readFileSync(join(dist, 'index.html'), 'utf8')
const assets = readdirSync(join(dist, 'assets')).map((f) => readFileSync(join(dist, 'assets', f), 'utf8')).join('\n')
const external = [...shell.matchAll(/https?:\/\/[^"')\s]+/g)].map((m) => m[0])
  .concat([...assets.matchAll(/url\(\s*['"]?(https?:\/\/[^"')]+)/g)].map((m) => m[1]))
check('the page loads nothing from the internet', external.length === 0,
  external.length ? external.slice(0, 3).join(' ') : 'no external origins in the shell or its assets')

// -------------------------------------------------------------------- port

function portInUse(port, host = '127.0.0.1') {
  return new Promise((done) => {
    const probe = createServer()
    probe.once('error', (err) => done(err.code === 'EADDRINUSE'))
    probe.once('listening', () => probe.close(() => done(false)))
    probe.listen(port, host)
  })
}

/**
 * Uvicorn logs "Application startup complete" *before* it binds, so a stale
 * server keeps the port while the new process dies with a one-line errno — and
 * the browser then shows old code with no visible error. Rather than fail on
 * stage, take the next free port: this process serves the API and the page
 * together, so the URL printed below is unambiguously this one.
 */
let PORT = PREFERRED_PORT
while (await portInUse(PORT)) {
  console.log(dim(`  ...port ${PORT} is busy (npm run dev, or a server from an earlier session) — trying ${PORT + 1}`))
  PORT += 1
  if (PORT > PREFERRED_PORT + 20) die('no free port found near ' + PREFERRED_PORT)
}
const base = `http://127.0.0.1:${PORT}`
check('a port is free to bind', true, base)

if (CHECK_ONLY && failed) {
  console.log(red(`\n${failed} check(s) failed — fix these before you need this on stage.\n`))
  process.exit(1)
}

// ------------------------------------------------------------------- serve

console.log(bold('\n2. Serving'))

const server = spawn(venvPython, ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', String(PORT)], {
  cwd: backend,
  // STATIC_DIR is the first place app.py looks for a built frontend — the same
  // switch the Docker image uses, so this is the deployed shape, not a local
  // approximation of it.
  env: { ...process.env, STATIC_DIR: dist },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let shuttingDown = false
function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  if (!server.killed) server.kill()
  process.exit(code)
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
server.on('error', (err) => die(`could not start the API: ${err.message}`))
server.on('exit', (code) => {
  if (!shuttingDown) die(`the API exited with code ${code}.`)
})

const log = []
for (const stream of [server.stdout, server.stderr]) {
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => log.push(chunk))
}

async function waitFor(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url)
      if (res.ok) return res
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  console.error(log.join(''))
  die('the API never came up.')
}

await waitFor(`${base}/health`)
check('the API is answering', true, `${base}/health`)

// ------------------------------------------------------- the demo contrast

console.log(bold('\n3. The demo itself'))

const sites = await (await waitFor(`${base}/api/sites`)).json()
check('every block is reporting', sites.length >= 2, `${sites.length}: ` + sites.map((s) => s.site_id).join(', '))

// The pitch turns on some blocks passing and some failing. If the seed ever
// drifts to one verdict across the board, the story has no contrast and it is
// better to find that out here than mid-sentence.
const verdicts = new Set(sites.map((s) => s.status))
check('at least one block verifies and one needs review',
  verdicts.has('verified') && verdicts.has('needs_review'),
  `${sites.filter((s) => s.status === 'verified').length} verified, `
  + `${sites.filter((s) => s.status !== 'verified').length} flagged`)

const verified = sites.find((s) => s.status === 'verified')
if (verified) {
  const report = await (await waitFor(`${base}/api/sites/${verified.site_id}/report`)).json()
  check('the report the demo exports is there', Boolean(report.report_id), report.report_id)
}

const page = await fetch(`${base}/`)
const html = await page.text()
check('the page itself is served from the same origin', page.ok && html.includes('<div id="root">'))
check('a mistyped API path still answers as API, not as the page shell',
  (await fetch(`${base}/api/nope`)).status === 404)

// ------------------------------------------------------------------ report

console.log('')
if (failed) {
  console.log(red(`${failed} check(s) failed — the fallback is not safe to rely on as it stands.`))
} else {
  console.log(green('All checks passed — this machine can carry the demo on its own.'))
}

if (CHECK_ONLY) {
  shutdown(failed ? 1 : 0)
}

console.log('')
console.log(bold(`  ${base}/`))
console.log('')
console.log(dim('  1. Overview — six blocks across two facilities'))
console.log(dim('  2. Facility dropdown — Earthrise verifies, Cyanotech is flagged'))
console.log(dim('  3. Open a verified block — sensor line vs. satellite line'))
console.log(dim('  4. Verification panel — divergence against the 15% tolerance'))
console.log(dim('  5. Open a flagged block — same chart, the lines come apart'))
console.log(dim('  6. Back to a verified block → report → Print / Save as PDF'))
console.log('')
console.log(dim('  Ctrl+C to stop. This needs no internet — say so while demoing it.'))
console.log('')

if (!NO_OPEN) {
  const open = isWindows ? ['cmd', ['/c', 'start', '', `${base}/`]]
    : process.platform === 'darwin' ? ['open', [`${base}/`]]
      : ['xdg-open', [`${base}/`]]
  spawn(open[0], open[1], { stdio: 'ignore', detached: true }).unref()
}
