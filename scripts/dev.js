#!/usr/bin/env node
/**
 * Starts the FastAPI backend and the Vite frontend together (`npm run dev`).
 * No dependency on concurrently — it just spawns both and mirrors their output
 * with a prefix, and tears both down if either one exits.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const isWindows = process.platform === 'win32'

// Must match `frontend/vite.config.js` — the proxy target and the dev port.
const API_PORT = 8000
const WEB_PORT = 5173

// Prefer the backend virtualenv; fall back to whatever python is on PATH.
const venvPython = join(root, 'backend', '.venv', isWindows ? 'Scripts' : 'bin', isWindows ? 'python.exe' : 'python')
const python = existsSync(venvPython) ? venvPython : isWindows ? 'python' : 'python3'

if (!existsSync(venvPython)) {
  console.warn('[dev] backend/.venv not found — falling back to system python.')
  console.warn('[dev] run: cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt')
}

/**
 * Refuse to start if a port is already taken.
 *
 * This is not politeness. Uvicorn logs "Application startup complete" *before*
 * it binds, so a stale server from an earlier session keeps the port and the
 * new process dies with a one-line errno while the old code carries on
 * answering. The frontend then talks to a backend built from source that no
 * longer exists, and the failure surfaces as a mystery 404 in the browser
 * rather than as a crash in the terminal. Losing half a phase to that once is
 * enough — fail loudly here instead.
 */
function portInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', (err) => resolve(err.code === 'EADDRINUSE'))
    probe.once('listening', () => probe.close(() => resolve(false)))
    probe.listen(port, host)
  })
}

async function requireFreePort(port, name) {
  if (!(await portInUse(port))) return
  console.error(`[dev] port ${port} is already in use — ${name} cannot start.`)
  console.error('[dev] a stale server there will keep answering with old code. Free it first:')
  console.error(isWindows
    ? `[dev]   Get-NetTCPConnection -LocalPort ${port} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
    : `[dev]   lsof -ti :${port} | xargs kill -9`)
  if (isWindows) {
    console.error('[dev] kill the uvicorn *child* too — it inherits the listening socket and')
    console.error('[dev] outlives its parent, so the port can still be held after the kill.')
  }
  process.exit(1)
}

const procs = []
let shuttingDown = false

function start(name, color, command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
  const tag = `\x1b[${color}m[${name}]\x1b[0m `

  const pipe = (stream) => {
    stream.setEncoding('utf8')
    let buffer = ''
    stream.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) process.stdout.write(tag + line + '\n')
    })
  }
  pipe(child.stdout)
  pipe(child.stderr)

  child.on('exit', (code) => {
    if (shuttingDown) return
    console.log(`${tag}exited with code ${code} — shutting down the other process.`)
    shutdown(code ?? 1)
  })
  child.on('error', (err) => {
    console.error(`${tag}failed to start: ${err.message}`)
    shutdown(1)
  })

  procs.push(child)
  return child
}

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const p of procs) {
    if (!p.killed) p.kill()
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

// Vite is launched via its JS entrypoint rather than `npm run dev`: spawning
// npm.cmd without a shell throws EINVAL on Windows, and using a shell would
// leave an orphaned grandchild process behind on shutdown.
const viteBin = join(root, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js')

if (!existsSync(viteBin)) {
  console.error('[dev] frontend dependencies missing — run: npm --prefix frontend install')
  process.exit(1)
}

await requireFreePort(API_PORT, 'the API')
await requireFreePort(WEB_PORT, 'Vite')

start('api', '36', python, ['-m', 'uvicorn', 'app:app', '--reload', '--host', '127.0.0.1', '--port', String(API_PORT)], join(root, 'backend'))
start('web', '35', process.execPath, [viteBin], join(root, 'frontend'))
