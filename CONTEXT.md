# HackOut'26 — Project Context (continue here in VS Code)

**Team:** Pixel Error · **College:** Adani University · **Track:** Circular Carbon Ecosystem

## What we're building

**Algae-Based Carbon Sequestration Monitoring Platform** — a monitoring platform that cross-verifies on-site IoT sensor data against independent satellite imagery to produce a credible, auditable CO2-sequestration figure for algae cultivation sites (instead of trusting self-reported sensor numbers alone).

We picked this over 5 other candidate problem statements from the HackOut'26 brief (from Renewable Energy Intelligence and Circular Carbon Ecosystem tracks) after weighing 36-hour feasibility, demo impact, and how "seen before" each idea was. Started with the Consumer Carbon Loop App, then switched to this one.

## Files in this folder

- **`prd.md`** — full PRD: problem statement, proposed solution, approach, key features, tech stack, and the **7-phase build plan, each phase with its own verification checklist that must pass before the next phase starts**. This is the main reference — follow it phase by phase.
- **`architecture.md`** — lightweight architecture: repo folder structure + the fixed **API contract** (exact request/response JSON) between backend and frontend. Deliberately NOT a full function-call-graph — that goes stale immediately; decide internal function structure while coding.
- **`Algae_Carbon_Sequestration_Proposal.docx`** — the 2-page Word write-up for hackathon submission paperwork (Problem Statement / Proposed Solution / Approach / Key Features / Tech Stack, plain Times New Roman format, no branding baked in).

## Key technical decisions already made (don't relitigate these)

- **Sensor data is simulated**, not read from real hardware — logistic growth curve modulated by a diurnal light/temperature cycle, with realistic noise. No real IoT devices needed.
- **CO2 conversion constant: ~1.8 kg CO2 fixed per kg dry algae biomass** — derived from ~50% carbon content in biomass and the CO2/C molecular-weight ratio (~3.67), backed by published microalgae biofixation studies (Chlorella vulgaris / Nannochloropsis).
- **Satellite verification uses real, free Sentinel-2 imagery** (Copernicus / ArcGIS ImageServer), reduced to one simple vegetation/chlorophyll index (NDVI/NDCI) — NOT a full computer-vision pipeline. Precompute and cache these values before the demo; never call the imagery API live on stage (deployment risk).
- **Verification logic** = compare the sensor-derived CO2 trend against the imagery-derived proxy over a rolling window; flag "Verified" if within tolerance (e.g. ±15%), else "Needs Review." This reconciliation logic is the actual differentiator/AI-ML story — frame it that way in the pitch, not as raw sensor dashboards.
- **Explicitly out of scope** (protects the 36-hour timeline): no auth/multi-tenant, no live blockchain/credit-registry integration, no real hardware, no on-stage live satellite API calls.

## Design

A 3-screen dashboard mockup (Site Overview, Site Detail with sensor-vs-satellite trend chart + verification panel, Investor/Credit Report) was built as a design canvas — clean sustainability-SaaS look: white cards, teal (`#0f766e`) accent, Sora for headings, IBM Plex Sans for body, IBM Plex Mono for data figures, amber for "needs review" status. Use this as the visual reference when building the Phase 4 frontend — match the palette, type, and layout rather than re-deriving a new visual style.

(The design canvas is a hosted link in the Cowork conversation this context came from — if you need to re-open it, ask there rather than recreating it from scratch.)

## Current status

- [x] Problem selected, feasibility-checked
- [x] PRD written (`prd.md`)
- [x] Architecture + API contract written (`architecture.md`)
- [x] Dashboard design mockups built (3 screens, one direction chosen)
- [x] **Phase 0 — Setup & Scoping** — repo scaffolded, stack locked (FastAPI + React/Vite), `npm run dev` runs both, `/api/ping` returns 200 (see `prd.md` §11 Phase 0 for details)
- [x] **Phase 1 — Dataset & Reference Constants** — 2 real sites (Earthrise CA, Cyanotech HI; Parry Oonaiyur dropped as not resolvable), real Sentinel-2 NDCI cached to `data/imagery_index.csv`, seeded sensor simulator, CO2 constants = 1.8321. 14/14 checks pass via `backend/verify_phase1.py`
- [x] **Phase 2 — Backend Growth & CO2 Engine** — `engine/store.py` + `engine/co2.py` turn hourly readings into cumulative CO2 fixed (gross production × 1.8321, no back-filling of missing hours); `/api/sites`, `/api/sites/:id`, `/api/sites/:id/readings`, `/api/sites/:id/imagery-index` live and matching the contract. 23/23 checks pass via `backend/verify_phase2.py` (see `prd.md` §11 Phase 2 for details)
- [x] **Phase 3 — Verification / Reconciliation Engine** — `verification/reconcile.py` compares reported biomass density against the satellite NDCI as normalised trends over RULE-001's 14-day rolling window; `/api/sites/:id/verification` live, and `status` is now a real verdict everywhere (site-a verified, site-b needs_review). 26/26 checks pass via `backend/verify_phase3.py` (see `prd.md` §11 Phase 3 for details)
- [x] **Phase 4 — Frontend Dashboard** — three hash-routed screens (overview, site detail, report) wired to the live API, sensor-vs-satellite trend chart with both signals indexed to 100, verification panel plotting divergence against its tolerance. 75/75 checks pass via `node verify_phase4.mjs` in `frontend/` — it drives the production build in headless Chrome and compares every on-screen figure against the API response behind it (see `prd.md` §11 Phase 4 for details)
- [x] **Phase 5 — Reporting & Polish** — `reporting/report.py` + `GET /api/sites/:id/report` assemble the credit-readiness document (report id as a content fingerprint, `agreement_pct` = 100 − peak divergence); the Report screen exports via `window.print()` against a print stylesheet, A4, no PDF dependency. 100/100 checks pass via `node verify_phase5.mjs` in `frontend/` — it renders the real PDF through Chrome and cross-checks every figure against four independent sources (see `prd.md` §11 Phase 5 for details)
- [~] **Phase 6 — Testing & Deployment** — the app now deploys as **one service on one origin**: FastAPI serves the built SPA itself (`Dockerfile` + `render.yaml`, Render free plan, health check on `/health`). 120/120 checks pass via `node verify_phase6.mjs` in `frontend/`, and 116/116 against the **Docker image itself** via `node verify_phase6.mjs --target http://127.0.0.1:8123`. **Remaining:** push to GitHub, create the Render service, then re-run the gate with `--target <live url>` and open the link on a real phone (see `prd.md` §11 Phase 6 — two checklist items are deliberately still open)
- [ ] Phase 7 — Pitch Prep

## Gotchas worth keeping

### The stale server that keeps answering

`npm run dev` now **refuses to start** if port 8000 or 5173 is already held, and prints the command to free it. That is deliberate: uvicorn logs "Application startup complete" *before* it binds, so a stale server from an earlier session keeps the port, the new process dies with a one-line errno, and the frontend quietly talks to a backend built from source that no longer exists. It surfaces as a mystery 404 in the browser, not as a crash in the terminal — it cost most of Phase 4 once. On Windows kill the uvicorn *child* too; it inherits the listening socket and outlives its parent.

### The lockfile that only builds on this machine

`frontend/package-lock.json` had all 106 packages resolved to `https://nexus.iqm.services` — a corporate npm mirror picked up from this machine's global `~/.npmrc`. It installs perfectly here and fails with `401 Unable to authenticate` in **any** build that is not here, including Render's. It is now rewritten to `registry.npmjs.org`, `frontend/.npmrc` pins the public registry so the next `npm install` cannot undo that, and the Phase 6 gate fails if a private host ever reappears in the lockfile. If you add a dependency and the deploy suddenly 401s, look here first.

### A gate can pass on its own comment

The Phase 6 check for "the container honours `$PORT`" originally grepped the whole Dockerfile — and matched the *comment* explaining why `$PORT` matters, so it still passed after the canary hard-coded the port. It now reads the `CMD` line only. When a check greps a file, make sure it greps the part that does the work.

## How to continue

Open this folder in VS Code with Claude Code and finish **Phase 6** (deploy + real-device pass), then start **Phase 7 — Pitch Prep** per `prd.md` §11. `npm run dev` from the project root brings up both services; the phase gates are `python verify_phase1.py` / `verify_phase2.py` / `verify_phase3.py` in `backend/` and `node verify_phase4.mjs` / `verify_phase5.mjs` / `verify_phase6.mjs` in `frontend/` (the last three share the browser harness in `verify_lib.mjs`; note Phase 6 boots the **single-origin production shape**, not Vite, and takes `--target <url>` to run the same checks against a real deployment), and all six should stay green as later phases land. Verify each phase against its checklist in `prd.md` before moving to the next — don't skip ahead. Update the checklist above (and in `prd.md`) as each phase is actually verified working; that running log is the project's documentation — no need to write more upfront.
