# Product Requirements Document (PRD)

## Algae-Based Carbon Sequestration Monitoring Platform

**Track:** Circular Carbon Ecosystem — HackOut'26
**Team:** Pixel Error
**Document status:** Build reference — updated as each phase is verified

---

## 1. Overview

A monitoring platform that gives algae-farm operators, carbon-credit verifiers, and investors a single, trustworthy answer to the question *"how much CO2 is this site actually sequestering?"* It does this by cross-checking two independent signals — on-site IoT sensor data and satellite imagery — instead of relying on self-reported sensor numbers alone.

## 2. Problem Statement

Algae farms are emerging as a scalable way to capture CO2 and produce biofuel, food, or bioplastics, but tracking their actual sequestration performance is difficult. Manual sampling is slow, sensor data alone is easy to misreport or mis-calibrate, and there is currently no independent way to cross-check a claimed sequestration figure. This trust gap slows investment and undermines the credibility of algae-based carbon credits.

## 3. Goals & Success Metrics

| Goal | How we'll know it worked |
|---|---|
| Produce a credible, cross-verified CO2 figure | Verification engine agrees/disagrees correctly on test cases with known ground truth |
| Make the platform demo-able end-to-end in 36 hours | Every phase below passes its verification checklist before the next starts |
| Make the pitch land with judges | Live demo runs the full user journey without errors, in under 3 minutes |

## 4. Users

- **Algae farm operators** — need a live view of pond health and growth.
- **Carbon-credit verifiers / auditors** — need an auditable, defensible sequestration number.
- **Environmental researchers / investors** — need measurable performance data to justify funding.

## 5. Scope

**In scope**
- Simulated IoT sensor time-series (growth rate, CO2 uptake, water quality) for 2–3 demo sites.
- Real, free Sentinel-2 imagery for the same sites, reduced to a simple vegetation/chlorophyll index.
- A reconciliation engine that compares the two signals and flags "verified" vs. "needs review."
- A dashboard (site overview, trend charts, verification status) and a one-click report export.

**Out of scope (explicitly, to protect the 36-hour timeline)**
- Real IoT hardware — sensor data is simulated, not read from physical devices.
- Live, on-stage satellite API calls — imagery indices are pulled and cached before the demo.
- Full computer-vision pipelines on raw imagery — we compute one simple band-index, not object detection.
- User authentication / multi-tenant accounts — single demo login is enough.
- Real carbon-credit issuance/blockchain integration — the "credit-ready report" is a formatted export, not a live registry submission.

## 6. System Architecture (high level)

```
[Sensor Simulator] ---\
                        >---> [Reconciliation Engine] ---> [API] ---> [Dashboard]
[Sentinel-2 Index]  ---/                                              |
                                                                       v
                                                              [Report Export]
```

- **Sensor Simulator** — generates realistic pond time-series from a growth model.
- **Sentinel-2 Index** — precomputed vegetation/chlorophyll index per site per date.
- **Reconciliation Engine** — compares the two trends, flags status, computes CO2 sequestered.
- **API** — serves sites, readings, and verification status to the frontend.
- **Dashboard** — site map, trend charts, verification status, report export.

## 7. Data Model

**`sites`** — `site_id`, `name`, `location`, `species` (Chlorella / Spirulina / Nannochloropsis), `pond_area_m2`, `pond_type` (open raceway / photobioreactor), `commissioning_date`.

**`sensor_readings`** — `site_id`, `timestamp`, `water_temp_C`, `pH`, `dissolved_O2_mg_L`, `dissolved_CO2_mg_L`, `turbidity_NTU`, `light_PAR`, `biomass_density_g_L`.

**`imagery_index`** — `site_id`, `date`, `ndci_value` (precomputed from Sentinel-2 bands).

**`verification_rules`** — `rule_id`, `condition` (e.g. rolling 7-day tolerance %), `action` (verified / flag for review).

**`co2_conversion_constants`** — `carbon_fraction_biomass` (~0.5), `co2_to_carbon_mw_ratio` (~3.67) → combined **~1.8 kg CO2 per kg dry biomass**.

## 8. Functional Requirements

1. Generate multi-week sensor time-series per site using a logistic growth model modulated by a diurnal light/temperature cycle.
2. Convert biomass growth to CO2 sequestered using the constants above.
3. Pull/precompute an NDCI (or NDVI) value per site per date from free Sentinel-2 imagery.
4. Reconcile sensor-derived cumulative CO2 uptake against the imagery-derived proxy over a rolling window; mark each site "Verified" or "Needs Review."
5. Dashboard shows, per site: current status, growth/CO2 trend chart (sensor vs. satellite), and pond metadata.
6. One-click export of a verification/credit-readiness report per site.

## 9. Non-Functional Requirements

- Dashboard loads demo data in under 2 seconds.
- All demo data is seeded/reproducible — no randomness that changes between rehearsal and the live demo.
- No dependency on a live third-party API call during the actual judging demo (imagery indices precomputed and cached).

## 10. Technology Stack

| Layer | Technology |
|---|---|
| Sensor simulation | Python (NumPy/Pandas) |
| Remote verification | Sentinel-2 imagery (Copernicus / ArcGIS ImageServer), precomputed NDVI/NDCI |
| Backend & API | Python (FastAPI) or Node.js (Express) |
| Database | PostgreSQL / SQLite |
| Frontend dashboard | React + Recharts/D3.js |
| Deployment | Vercel / Render / Railway |

## 11. Phase-by-Phase Build Plan (with verification gates)

Each phase below must pass its **Verification Checklist** before the next phase begins. This is a hard gate, not a suggestion — it's what keeps a 36-hour build from collapsing at hour 30.

### Phase 0 — Setup & Scoping (Hrs 0–2)
**Tasks:** assign roles, lock tech stack, wireframe the 3 core screens, scaffold repo (frontend + backend skeletons, empty DB).
**Deliverable:** a repo that runs locally and shows a stub page/route.
**Verification checklist:**
- [x] `npm run dev` / equivalent starts both frontend and backend without errors.
- [x] A placeholder API endpoint returns a 200 response.
- [x] Wireframes reviewed and agreed on by the whole team. *(done pre-build — 3-screen design canvas, see CONTEXT.md § Design)*

**What was actually built (Phase 0):**
- **Stack locked:** backend = Python 3.12 / FastAPI + Uvicorn (venv at `backend/.venv`, deps pinned in `backend/requirements.txt`: fastapi, uvicorn, pydantic, numpy, pandas). Frontend = React 19 + Vite 8 (`frontend/`), with `recharts` pre-installed for the Phase 4 trend chart.
- **Folder structure** scaffolded exactly per `architecture.md` §1 — `backend/{simulator,engine,verification,api,data}`, `frontend/src/{pages,components,api}`.
- **Backend:** `backend/app.py` is the app factory — mounts `api/routes.py` under `/api`, enables CORS for the Vite dev origins, and exposes `GET /health`. `GET /api/ping` is the Phase 0 placeholder route. Contract routes from `architecture.md` §3 get added to `api/routes.py` in Phases 2–3.
- **Frontend:** `src/api/client.js` is the fetch client (same-origin `/api` paths). `vite.config.js` proxies `/api` → `127.0.0.1:8000`, so no environment-specific base URL is needed. `src/index.css` carries the design tokens so Phase 4 doesn't re-derive a palette. *(These were the Phase 0 canvas tokens -- teal `#0f766e`, amber, Sora / IBM Plex. They were replaced wholesale after the mid-eval by the editorial moss/bone/Times art direction; see CONTEXT.md section Design. The token **names** did not change, which is why the swap touched one stylesheet and two colour literals rather than every component.)* `src/App.jsx` is a stub screen that calls `/api/ping` and shows the live API status.
- **One-command dev:** root `package.json` → `npm run dev` runs `scripts/dev.js`, which spawns Uvicorn (`:8000`) and Vite (`:5173`) together with prefixed output and shared shutdown. It launches Vite's JS entrypoint directly rather than `npm run dev`, because spawning `npm.cmd` without a shell throws `EINVAL` on Windows (hit and fixed during this phase).
- **Git:** repo initialised at the project root with a `.gitignore` covering `node_modules/`, `.venv/`, `__pycache__/`, `dist/`, `.env`. No commit made yet.

### Phase 1 — Dataset & Reference Constants (Hrs 2–8)
**Tasks:** build the sensor-data simulator (logistic growth + diurnal cycle + noise); pull Sentinel-2 tiles for demo sites and compute NDCI; write the CO2-conversion constants and verification-rule config; write site metadata.
**Deliverable:** CSVs/seed files for `sites`, `sensor_readings`, `imagery_index`, `verification_rules`.
**Verification checklist:** *(all 14 automated checks pass -- run `python verify_phase1.py` in `backend/`)*
- [x] Plotting `sensor_readings` shows a believable growth curve (not random noise). *(lag-1 autocorrelation of hourly production r1=+0.912 / +0.919 vs shuffled ~-0.02; plot shows daily stair-steps climbing to carrying capacity with harvest draw-downs)*
- [x] `imagery_index` has one value per site per date, no gaps in the demo window. *(site-a 9 acquisitions, median gap 5d / max 10d; site-b 6, median 5d / max 15d; no duplicate dates)*
- [x] CO2 conversion applied to a known biomass value gives the expected ~1.8x figure by hand-check. *(1000 kg dry biomass -> 1832.1 kg CO2, factor 1.8321)*
- [x] Data loads into the database without schema errors. *(SQLite: sites 2, sensor_readings 2016, imagery_index 15, verification_rules 1; zero foreign-key orphans)*

**What was actually built (Phase 1):**
- **Sites cut from three to two.** `simulator/sites.py` defines **site-a Earthrise Nutritionals** (Calipatria, CA -- *Spirulina platensis*, open raceway) and **site-b Cyanotech** (Keahole Point, HI -- *Haematococcus pluvialis*, open raceway), both real operating facilities. A third candidate, E.I.D. Parry's Oonaiyur farm in Tamil Nadu, was **dropped**: it returns zero water pixels (SCL water 0.00, NDWI -0.41) and a persistent-NDCI scan over an 8 km box gives 4,053 clusters at ~+0.43 -- that is the surrounding cropland, not ponds. Sampling it would have measured fields. Reason is recorded in `sites.py` so it isn't silently re-added. PRD 5 allows 2-3 sites.
- **Real Sentinel-2 data, fetched and cached.** `simulator/fetch_imagery.py` queries the Element84 earth-search STAC API (free, no auth) for Sentinel-2 L2A, reads B5/B4/SCL as windowed COGs, and computes NDCI = (B5-B4)/(B5+B4). Cloud screening is done **on the AOI via the scene-classification band**, not on scene-level `eo:cloud_cover` -- a 110 km tile statistic says nothing about a 600 m pond block. Output: `data/imagery_index.csv`, 15 rows. Never called at runtime (PRD 5/9).
- **Pond masking is what makes the index real.** Sampling the whole AOI box gave NDCI +0.064..+0.098, because berms, roads and buildings swamped the ponds. The footprint is now delineated once from the per-pixel *temporal median* across all clear dates (top 40% of AOI pixels), then frozen and reused for every date -- so a value can't move because the mask moved. Signal rose to **+0.236..+0.272 (site-a)** and **+0.148..+0.213 (site-b)**. Mask verified visually against true-colour imagery: site-a lands cleanly on the pond rectangles, excluding berms and processing buildings.
- **Sensor simulator.** `simulator/simulate_sensors.py` -- logistic growth modulated by a diurnal light/temperature cycle (solar-declination photoperiod, Monod light response with photoinhibition, Gaussian thermal response) plus semi-continuous harvesting. Growth is driven by the **real** interpolated NDCI series, so sensor and satellite are genuinely related signals. Seeded (`SEED = 20260912`) for byte-identical reruns (PRD 9). Output: `data/sensor_readings.csv`, 2016 hourly rows; `data/sites.csv`.
- **The "needs review" case is injected here, not faked downstream.** `REPORTING_DRIFT = {"site-b": 0.34}` ramps a 34% over-statement into site-b's reported density across the window, so Phase 3 has to actually detect it.
- **Constants and rules are configurable, not inline.** `engine/constants.py` holds the CO2 factor (0.50 carbon fraction x 3.664 CO2/C = **1.8321 kg CO2/kg dry biomass**), raceway depth and per-species growth parameters. `verification/rules.py` holds `RULE-001`: 15% tolerance, 14-day rolling window, 2 consecutive breaches to flag -- satisfying the Phase 3 requirement that tolerance not be hard-coded.
- **`verify_phase1.py`** runs the gate and exits non-zero on failure, so the checklist can't be passed by assertion.
- **Carry into Phase 3:** site-a's NDCI is nearly flat with noise (0.236-0.272, no trend) while site-b's rises steadily (0.148->0.213). Reconciliation must compare *normalised trends over a rolling window*, not absolute levels, or the flat-but-honest site will look worse than the drifting one. Also note site-b's mask is speckled -- its ponds are narrower than the 20 m red-edge pixel -- so a noisy index there is a measurement limit, not necessarily operator misreporting.

### Phase 2 — Backend Growth & CO2 Engine (Hrs 8–14)
**Tasks:** implement the calculation layer that turns `sensor_readings` into cumulative CO2-sequestered per site.
**Deliverable:** an API endpoint returning CO2-sequestered time series per site.
**Verification checklist:** *(all 23 automated checks pass -- run `python verify_phase2.py` in `backend/`)*
- [x] Unit test with a hand-calculated input/output pair passes within tolerance. *(1000 kg dry biomass -> 1832.07 kg CO2; and a named day re-summed from the raw CSV with a longhand 0.50 x 44.01/12.011 -- site-a 2026-08-15, 2119.69 kg biomass -> 3883.41 kg CO2, engine agrees to 0.01 kg; whole-window cumulative agrees to 0.003 kg)*
- [x] Endpoint returns correct values for all seeded demo sites. *(both sites: headline figure matches the independent CSV sum, response keys match `architecture.md` 3 exactly, 42 contiguous daily points, cumulative monotonic and ending on the headline figure, imagery series complete; areal productivity 10.2 and 4.7 g dry weight/m2/day, inside the real open-raceway band)*
- [x] Edge cases (missing readings, first-day-of-cycle) don't crash the calculation. *(run against a deliberately damaged copy of the seed data: a whole day deleted, a day with 18 of 24 hours missing, a site with exactly one day of readings, a site that has never reported, and an unknown site id)*

**What was actually built (Phase 2):**
- **`engine/store.py` -- read-only data access.** Reads the Phase 1 CSVs (not `algae.db`, which the Phase 1 gate deletes and rebuilds), parses each file once and caches it. An unknown site raises a typed `UnknownSiteError` the API maps to 404; a *known* site with no readings returns an empty frame, because a pond that has not reported yet is a real state, not a failure. Nothing here touches the network -- the PRD 12 "no live satellite calls on stage" rule is enforced by construction, not by remembering.
- **`engine/co2.py` -- the calculation layer.** Hourly `biomass_produced_kg` -> daily total -> x **1.8321 kg CO2/kg dry biomass** -> cumulative over the window. Deliberately short so a verifier can audit it end to end.
- **Two modelling choices worth defending out loud.** (1) CO2 follows **gross production, not standing crop** -- carbon is fixed when biomass grows, and harvesting removes biomass without un-fixing it, so cumulative CO2 must not track the density curve, which sawtooths down at every harvest. (2) What the sensors support is biological **fixation** over the window; whether it stays out of the atmosphere depends on what the harvested biomass becomes, which is out of scope (PRD 5) -- so the wording stays "fixed", and the maths doesn't inflate the claim.
- **Missing data is never back-filled.** A missing hour reduces that day's total rather than being interpolated, and every day carries a `coverage` fraction (hours present / 24) so a partial day is visible to the Phase 3 engine instead of being silently averaged into looking normal. Cumulative CO2 accumulates from the start of the *requested* range, so a trimmed chart is self-consistent.
- **Endpoints shipped** (`api/routes.py`, shapes enforced by pydantic models in `api/schemas.py` so an engine field can never leak into a response): `GET /api/sites`, `GET /api/sites/{id}`, `GET /api/sites/{id}/readings`, `GET /api/sites/{id}/imagery-index`. All accept `?range=6w|30d|all`; an unparseable range is a 400, an unknown site a 404 -- never a 500. Ranges anchor on the **last reading**, not on today's date, so the demo window is stable whenever the demo is run.
- **`status` is `"pending"` until Phase 3.** The contract enum is `verified | needs_review`; defaulting to `"verified"` before the reconciliation engine exists would be exactly the unchecked-claim-presented-as-checked problem this platform is built to fix. Phase 3 replaces the one constant in `api/routes.py` and narrows the enum.
- **Numbers sanity-check against the real world:** site-a 142,185 kg CO2 over 42 days (10.2 g dry weight/m2/day over 181,000 m2), site-b 32,205 kg (4.7 g/m2/day over 90,000 m2). Commercial open raceways run ~10-25 g/m2/day, with slower species at the bottom of the band -- so these are the right order of magnitude, which is the check that catches a volume or unit error.
- **`httpx` added to `requirements.txt`** so the gate can exercise the real app in-process via `TestClient` rather than requiring a running server.
- **Operational note:** a stale Uvicorn child process from an earlier session can keep holding port 8000 after its parent is killed (the child inherits the listening socket, and the port still reports the dead parent's PID). A new server then starts "successfully" while the old code keeps answering. If an endpoint 404s that the app clearly registers, check `Get-NetTCPConnection -LocalPort 8000` and kill the *child* too.

### Phase 3 — Verification / Reconciliation Engine (Hrs 14–18)
**Tasks:** implement the sensor-vs-imagery comparison logic and the "Verified / Needs Review" flag.
**Deliverable:** an API endpoint returning verification status per site with the underlying comparison numbers.
**Verification checklist:** *(all 26 automated checks pass -- run `python verify_phase3.py` in `backend/`)*
- [x] A site with matching trends is correctly flagged "Verified." *(site-a: peak divergence 11.5% against a 15% tolerance, never out of tolerance on any of the 28 compared days. The whole comparison is re-derived from the raw CSVs by the gate using stdlib only -- its own daily means, interpolation and rolling window -- and agrees with the engine to 1.3e-05. A synthetic site whose density is exactly 4x the NDCI curve comes out at 0.0%, so "verified" is earned rather than being the fall-through.)*
- [x] A site with an injected artificial discrepancy is correctly flagged "Needs Review." *(site-b, carrying the simulator's 34% reporting drift: peak divergence 26.8%, out of tolerance for 12 consecutive days against a rule needing 2. Proved to be drift detection rather than site-b recognition by dosing the honest site: 0% -> 11.5% verified, 10% -> 15.9%, 25% -> 24.9%, 50% -> 39.2%, monotonic with the verdict flipping between the first two. A -40% under-reporting dose is also caught, at -22.1%.)*
- [x] Tolerance threshold is configurable, not hard-coded inline. *(`verification/rules.py` holds RULE-001; the string "15" does not appear anywhere in `verification/reconcile.py`. Behaviourally: site-b at a 50% tolerance flips to verified, site-a at 1% flips to needs_review, and site-b with `consecutive_breaches_to_flag=999` stays verified -- so the persistence requirement is honoured too, not just the threshold.)*

**What was actually built (Phase 3):**
- **`verification/reconcile.py` -- the comparison.** Daily reported biomass density and daily-interpolated NDCI are each smoothed over the rule window, each divided by its own value in the calibration window (the first 14 days), and the divergence is the ratio of the two resulting indices minus one. A day outside tolerance is a breach; `consecutive_breaches_to_flag` consecutive breaches flag the site.
- **Density, not daily CO2 -- and this one is worth defending out loud.** NDCI is a *standing chlorophyll* proxy: it sees how much algae is in the pond, not how fast it is growing. Pairing it with daily production inverts the test, because a culture near carrying capacity has its highest standing crop and its lowest growth *rate*. Measured: with daily CO2 as the sensor signal the honest site breached 4 times at -17.7% while the drifting site read *negative* too -- the detector would have been reading the growth curve, not the drift. Density verifies the CO2 claim regardless, because Phase 2's figure is a fixed multiple of the same reported biomass.
- **Normalised trends, never absolute levels** -- one signal is g/L, the other a dimensionless index, and the constant relating them is unknown and site-specific. This is the Phase 1 carry-over discharged: site-a's flat NDCI no longer scores worse than site-b's rising one.
- **`divergence_pct` is the peak over the period, not the latest value.** site-b's latest window has recovered to +12.3% -- *inside* the 15% tolerance -- while the site is correctly flagged on a 12-day breach run. Reporting the latest figure would have put "needs_review" next to a number inside its own tolerance on the verification panel. The peak is the number the verdict was actually made on; the current value is stated in the explanation so the recovery is visible rather than hidden.
- **Rejected alternatives, measured not guessed.** Normalising both signals to their own whole-range mean absorbs a linear ramp and dropped site-b to 1 breach. Comparing 14-day growth *rates* can't see a 34%-over-42-days ramp at all (it is only ~11% per window). Fitting a trend line to the agreement ratio separates *worse* (site-a 13-19% vs site-b 21-26%), because site-a's culture start-up tilts the fit.
- **A site that cannot be checked is never quietly verified.** No readings, too few days overlapping usable imagery, no imagery, or imagery too cloudy to use all return "needs_review" with an explanation saying *why* -- absence of evidence is not evidence of agreement. Cloud screening (`max_cloud_fraction`) is inert on the current seed data (max 0.006) but is the gate a real MRV pipeline needs.
- **Known sensitivity floor, stated honestly.** The honest site sits at 11.5% against a 15% tolerance, most of which is its culture start-up ramp against a flat satellite index. So the engine reliably catches sustained drift of roughly 10% and up on this data -- it is not a sub-1% instrument, and the dose-response table above is the evidence for where it does and doesn't bite.
- **Status is now real everywhere.** `PENDING_STATUS` is gone from `api/routes.py`, `SiteStatus` in `api/schemas.py` is narrowed to the contract's `verified | needs_review`, and the gate checks all three endpoints report the same verdict for a site so the badge can never disagree with the panel.

### Phase 4 — Frontend Dashboard (Hrs 18–26)
**Tasks:** build site overview, growth/CO2 trend chart (sensor vs. satellite), verification status badge, wire everything to the live API.
**Deliverable:** working dashboard against real backend data (not mock JSON).
**Verification checklist:** *(all 75 automated checks pass -- run `node verify_phase4.mjs` in `frontend/`)*
- [x] All 3 screens load with real API data, no hard-coded frontend mocks left in place. *(the gate drives the **production build** in headless Chrome and compares every figure on screen against the API response it came from, fetched independently: card headline 142,185 / 32,205 kg, badges, sparkline point counts, detail tiles, the 42-row chart table with exactly 9 and 6 satellite acquisitions, report tonnage 142.2 t and reporting period. Source is also scanned: no seeded site id / name / species anywhere in `src`, no mock/fixture/stub module, no bundled `.json`, and `api/client.js` is the only module that calls `fetch`.)*
- [x] No console errors on any screen. *(read off the browser over the Chrome DevTools Protocol -- `console.error`, uncaught exceptions, `Log` errors and any request returning >= 400 -- on all three screens, after a site switch and after a range switch. React logs its warnings through `console.error`, so key/prop warnings fail this too.)*
- [x] Switching between demo sites updates all charts correctly. *(site-a -> site-b by hash change, not reload, so it exercises the refetch path: title, tiles, verdict Verified -> Needs review, explanation, and all three chart curves compared by their SVG path geometry -- an unchanged `d` is a failure. Same again for the 6w -> 30d window: 32,205 -> 22,947 kg, 42 -> 30 rows, curves redrawn.)*

**What was actually built (Phase 4):**
- **The API error that ended the last session was never in the code.** A stale uvicorn from an earlier session was still holding :8000 and answering with pre-Phase-3 source, so `/api/sites/:id/reconciliation` 404'd while `routes.py` on disk plainly registered it. This is the Phase 2 operational note recurring, and it cost most of a phase, so it is now **fixed in two places rather than written down again**: `scripts/dev.js` refuses to start when 8000 or 5173 is taken and prints the kill command (uvicorn logs "Application startup complete" *before* it binds, so the old code otherwise wins silently), and the Phase 4 gate **starts its own backend on a free port** and points the preview build at it via `API_TARGET`. A gate that trusts whatever is listening on 8000 can pass against source that no longer exists.
- **Three screens, hash-routed, no router dependency.** `#/` overview, `#/site/:id` detail, `#/site/:id/report`. Hash URLs deep-link and survive a refresh on any static host, which is what Phase 6 deploys to.
- **One value axis, both signals indexed to 100** (`lib/series.js`). Reported biomass is g/L and NDCI is a dimensionless band index; a twin-y-axis chart would invent a correlation by choosing where the two scales line up. Indexing to the window start is also exactly what RULE-001 compares, so the chart *shows* the reconciliation rather than decorating it.
- **Satellite gaps are drawn as gaps.** Acquisitions are sparse (9 and 6 over six weeks); nothing is interpolated into the data, and `connectNulls` bridges the line visually. A day no satellite passed looks like one.
- **The verification panel plots the divergence against its own tolerance.** A verdict beside a bare percentage makes the reader guess which side of the line it falls on. Note the panel reports *peak* divergence, matching Phase 3 -- site-b reads 26.8% peak while currently at +12.3%, and the explanation says so rather than hiding the recovery.
- **Status is never colour alone** -- every badge carries an icon and the word, so a colourblind reader, a greyscale print and a screen reader all get the verdict.
- **The report does not invent registry fields.** `report_id`, `generated_at` and `agreement_pct` are the Phase 5 `GET /api/sites/:id/report` deliverable and are deliberately absent, not generated in the browser: a fabricated report id on a credit document is precisely the unchecked-claim problem this platform exists to fix.
- **Failure paths degrade.** An unknown site id renders the backend's `detail` string on screen ("unknown site 'does-not-exist'") instead of a blank page, and the gate checks that the only browser complaint in that case is the expected 404.
- **The gate has no dependencies and is not vacuous.** Chrome ships with the OS and Node 22 has a global `WebSocket`, so CDP is driven directly -- no Playwright install on hackathon wifi. Display formatters are re-implemented inside the gate rather than imported, since a gate that imports the code under test can only prove it is self-consistent. Proven by injecting two regressions (a `console.error`, and a hard-coded `999,999` headline): 6 checks failed across 4 groups, and both reverted clean.
- **`vite.config.js` now names the proxy target once** (`API_TARGET`, default `127.0.0.1:8000`) and spells out `preview.proxy` explicitly instead of relying on config fall-through from `server`. Also note `vite preview` binds `::1` only unless `--host 127.0.0.1` is passed -- an IPv4 health probe against it times out on a server that is in fact running.

### Phase 5 — Reporting & Polish (Hrs 26–30)
**Tasks:** build the one-click verification/credit-readiness report export; refine UI (spacing, labels, empty states).
**Deliverable:** exportable report (PDF/print view) per site.
**Verification checklist:** *(all 100 automated checks pass -- run `node verify_phase5.mjs` in `frontend/`)*
- [x] Exported report numbers match what the dashboard shows for the same site. *(checked as a closed loop rather than a spot check: the same figure is read from four independent places -- `/api/sites` (overview card), the rendered site-detail tile in the DOM, `/api/sites/:id/readings`, and `/api/sites/:id/report` -- and all four must agree, for both sites across all three ranges. The verdict is cross-checked the same way, so the badge on the document can never disagree with the badge on the screen that linked to it. Dosing `report.py` to inflate its own total by 0.1% fails 14 checks.)*
- [x] Report is legible and correctly formatted when opened fresh (not just in-browser preview). *(the gate renders the page through Chrome's real print pipeline with `Page.printToPDF` and inspects the bytes: valid `%PDF-`, complete `%%EOF`, 195 kB, **A4 MediaBox 595x842pt** confirming the CSS `@page` reached the PDF, and a bounded page count of 2. Content is verified under emulated print media -- the same cascade the PDF renders from: app header, breadcrumb and the export button itself are gone; the masthead and footer carrying the report id are present; background is white and body text pure black; no element overflows the printable width; and no card is taller than one page (440px vs 1017px), so `break-inside: avoid` cannot be defeated. The flagged site exports cleanly too.)*

**What was actually built (Phase 5):**
- **`reporting/report.py` -- a new package, deliberately.** The report composes `engine` (the CO2 figure) and `verification` (the verdict). Putting it inside `engine` would have made engine import verification while verification already imports engine -- a layering inversion for one function. It gets the `[Report Export]` node architecture.md §2 already drew. `GET /api/sites/{id}/report` returns the contract's seven keys and **nothing else**: species, tolerance and the explanation are already served by `/sites/{id}` and `/verification`, and duplicating them would create two sources for one number on a document whose whole value is that its numbers agree.
- **The report id is a content fingerprint, not a serial.** The contract sketches `AT-2026-0091`, which reads like a counter in a registry we do not have -- and minting a sequence implies an issuing authority this platform is not. `AC-2026-D6FD70` is instead a SHA-256 over what the report asserts: site, period, CO2 figure, verdict, rule id. Two properties fall out, both gated: re-running the demo reproduces the **same** id (so a screenshot from yesterday still matches the running system), and changing any published figure produces a **different** one (dosing the figure by 0.01 kg flips `9B8BD7 -> 452A82`; flipping the verdict flips it to `8B2013`). `generated_at` is honest wall-clock but is **excluded** from the hash -- otherwise the same data would mint a new identity every refresh and the id would prove nothing. The gate asserts that exclusion by reading the function's own source.
- **`agreement_pct` = 100 − |peak divergence|, and the peak is the point.** site-a reports 88.5% agreement, site-b 73.2%. Scoring against site-b's *latest* window (+12.3%, recovered) would have printed "94% agreement" beside a "Needs review" badge. A score that contradicts the verdict next to it is worse than no score, so the gate additionally requires a verified site to sit above the tolerance floor and a flagged site to sit below 100%.
- **Export is `window.print()` against a print stylesheet, not a PDF library.** The browser already paginates, embeds fonts and offers "Save as PDF" on every platform; a 200 kB dependency to re-do that worse is not a trade at this scale. It also means the exported artifact and the screen share one source of truth -- there is no second renderer to drift.
- **The print stylesheet is deliberately dull.** Design tokens are re-pointed at ink inside `@media print` rather than each rule being overridden, so anything token-driven follows along. Cards lose their shadows (they print as grey mud) and carry `break-inside: avoid`. The verdict badge gains a **border**, because printers routinely drop backgrounds and the badge is background-filled on screen -- the verdict must survive that, as it already survives colourblindness via its icon and label.
- **A zero is never printed without saying why.** A site with no readings in the window returns `"No sensor readings in the requested window"` as its period and stays `needs_review`, and the page shows a notice saying the zero means "has not reported", not "fixed no carbon". Gated by monkeypatching `co2.daily_series` to return nothing.
- **The Phase 4 gate's browser harness was extracted to `verify_lib.mjs`** and is now shared by both gates -- a second copy of a CDP driver is where the bug hides. Phase 4 still passes 75/75 after the refactor; its report-screen checks were updated to the new page and the report's own contract, fingerprint and print rendering moved to the Phase 5 gate that owns them.
- **Caught while building:** the print button was styled with `var(--accent)`, which does not exist in the token set (`--teal-700` does) -- an undefined custom property is not an error, so it would have shipped as white text on a transparent button. Worth remembering that CSS fails silently where the gates cannot see.

### Phase 6 — Testing & Deployment (Hrs 30–34)
**Tasks:** full end-to-end pass, fix bugs, deploy to a public hosted link.
**Deliverable:** a live URL that works on a device nobody on the team has tested on yet -- **https://algae-carbon-platform.onrender.com**.
**Verification checklist:** *(120 automated checks pass -- run `node verify_phase6.mjs` in `frontend/`; add `--target <url>` to run the same checks against a running deployment)*
- [x] Full user journey (site list → site detail → verification status → export) works **on the production artifact** -- 116/116 against the Docker image itself, driven by *clicking* (card → detail → report link → export → breadcrumb → brand), not by typing URLs, because the checklist item is that the links work. The export step is rendered through Chrome's real print pipeline and the PDF is checked for A4 bytes, so "export" means the artifact, not the button. **Confirmed on the live Render URL** at https://algae-carbon-platform.onrender.com -- the same journey, clicked through the deployed service over the public internet: **117/117** via `node verify_phase6.mjs --target https://algae-carbon-platform.onrender.com`.
- [ ] Tested on at least one device/browser outside the dev machine. *(The automatable part passes: phone (390x844) and tablet (768x1024) emulation across all three screens -- no horizontal scroll, nothing spilling past the viewport, 16px body type, header intact. That is **not** the same as a real phone on venue wifi, and the gate says so in a check of its own rather than quietly counting emulation as the real thing. Open one on a teammate's phone and tick this by hand.)*
- [x] No broken links, no dev-only debug output visible. *(Every anchor on all three screens is collected and asserted to be a live internal hash route -- no `#`, no `javascript:`, no unprotected `target=_blank` -- and each distinct destination is then loaded **cold**, as a fresh page load rather than a hash change, which is what a pasted link or a refresh actually does. Debug output is checked against the bytes the server sends, not the source: no `console.log`, no `debugger`, no sourcemap (`.map` returns 404), no `react-refresh`, no baked-in `localhost`, no internal hostnames, and no Vite dev client in the HTML. The browser must also report zero console errors, exceptions or failed requests across the entire journey.)*

**What was actually built (Phase 6):**
- **One service, one origin -- FastAPI serves the built SPA itself.** `app.py` mounts `frontend/dist` (or `backend/static/` in the image) at `/` *after* the API router, so `/api/...` is matched first and a mistyped API path still answers with a JSON 404 instead of the HTML shell. The alternative -- static host for the frontend, separate host for the API -- costs a CORS allowlist, two dashboards and a frontend that breaks when the backend sleeps, in exchange for nothing this project needs. It also deletes a whole class of bug: there is no production proxy to configure, because there is no proxy.
- **No SPA rewrite rule, by earlier design.** Routing is on the hash (`/#/site/site-a`), so every deep link is `/` as far as the server is concerned and survives a refresh with no host-specific rewrite config. The gate proves it by cold-loading each route rather than trusting the claim.
- **`healthCheckPath: /health`, deliberately not `/`.** `/` is served by the static mount, which answers even when the frontend build is missing entirely -- a health check pointed at it cannot detect the one failure most worth detecting.
- **Deployment is a Dockerfile + a Render blueprint, not dashboard clicks.** `render.yaml` is checked in, so the deploy is reviewable in the diff and reproducible if the service is ever deleted mid-hackathon. Multi-stage: `node:22-alpine` builds, `python:3.12-slim` runs and the Node toolchain is left behind (444 MB final image). The container binds `0.0.0.0` and takes `$PORT` from the host -- a container bound to loopback is unreachable, and one hard-coding 8000 is marked unhealthy and redeployed forever.
- **Caught while building, and the reason to build the image locally at all:** `frontend/package-lock.json` resolved all 106 packages to `https://nexus.iqm.services`, a corporate npm mirror inherited from the machine's `~/.npmrc`. `npm ci` succeeds here and fails with `401 Unable to authenticate` in any build that is not on this machine -- so the first Docker build died exactly where the Render build would have, except locally and in 8 seconds. Fixed by rewriting the `resolved` URLs to `registry.npmjs.org` (the integrity hashes are content hashes and stay valid -- Nexus is a transparent proxy, and had it not been, `npm ci` would have failed loudly on integrity rather than silently installing something else) and pinning `frontend/.npmrc` so the next `npm install` cannot re-point it. Both are now gated.
- **The gate tests the deployed topology, and can be aimed at the deployment.** `verify_phase6.mjs` never starts Vite: it boots the same single-origin uvicorn process Render boots (`bootSingleOrigin()` in `verify_lib.mjs`). `--target <url>` skips the build and runs every check against a URL instead, which is how the Docker image was verified (116/116) and how the live link gets verified once it exists. A gate that can only test localhost cannot check a checklist item that says "on the deployed link".
- **The service is live, and the free plan sleeps.** https://algae-carbon-platform.onrender.com, Render free plan, Singapore, created from the public repo URL rather than a linked GitHub account (the repo is Keya's, and only its owner can install Render's GitHub app). Because it is not linked, `render.yaml` is not applied automatically and there is no auto-deploy on push -- redeploys are a manual click in the dashboard, so the service settings were entered by hand to match the blueprint. The free instance also **spins down after ~15 minutes idle** and cold-starts in roughly 30-60s; open the link a couple of minutes before presenting, and treat that as the deploy risk Phase 7's fallback plan covers.
- **Bundle size, deferred out of Phase 5, is now measured rather than warned about.** Vite's "over 500 kB" notice is about the raw bundle; what matters on venue wifi is the transferred size, so the gate gzips what the server actually sends and holds it under 220 kB (currently **178 kB**, recharts included). Google Fonts stay `display=swap` with system fallbacks in `index.css`, so bad wifi degrades the typeface instead of blocking the render.
- **Proven non-vacuous with four injected regressions:** a stray `console.log` in `App.jsx`, a dead `href="#"` on the brand link, a hard-coded port in the Dockerfile, and the SPA mounted *before* the API router. Each was caught by the check written for it (the mount-order swap additionally took `/api/ping` to 404 and failed three more), and all 120 pass again on revert. The port canary initially slipped through -- the check matched the word `$PORT` in the Dockerfile's own explanatory comment -- so it now reads the `CMD` line only. Worth remembering: a check that greps a whole file can pass on the comment explaining why it matters.

### Phase 7 — Pitch Prep (Hrs 34–36)
**Tasks:** finalize slide deck, write and rehearse the demo script.
**Deliverable:** a rehearsed live demo + deck.
**Verification checklist:**
- [ ] Full demo run-through completed at least twice, under the judging time limit.
- [ ] A fallback plan exists if live internet/deployment fails (e.g. local build or recorded backup clip).

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Live satellite API fails during demo | Precompute and cache all imagery indices before judging — never call the API live on stage. |
| Sensor simulator looks obviously fake | Base it on a real logistic growth model with diurnal modulation and noise, not uniform random data. |
| Reconciliation logic is too simplistic to defend under judge questioning | Frame it honestly as a trend-agreement/anomaly-detection approach, citing the real CO2-biofixation ratio and MRV (measurement-reporting-verification) framing used in real carbon markets. |
| Running out of time before frontend polish | Phases are ordered so a working (if unpolished) backend + data pipeline exists by hour 18 — the dashboard is not the first thing built. |

## 13. Demo Script (target: under 3 minutes)

1. Open the dashboard — show the site list and one site's live status.
2. Point out the growth/CO2 trend chart — sensor line and satellite-proxy line moving together.
3. Show a site flagged "Needs Review" — explain what triggered it.
4. Export the verification report for the "Verified" site — this is the artifact a real investor/verifier would want.
5. Close with the core pitch: *"We don't just show sensor numbers — we prove them."*

## 14. Reference Sources

- CO2 biofixation ratio (~1.8 kg CO2 / kg biomass): published microalgae biofixation studies (*Chlorella vulgaris*, *Nannochloropsis*).
- Sentinel-2 imagery access: Copernicus / ArcGIS Sentinel-2 ImageServer (free, public).
