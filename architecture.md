# Architecture & API Contract

## Algae-Based Carbon Sequestration Monitoring Platform

This is intentionally lightweight — a folder layout and a fixed API contract, not a full call-graph. Internal function structure within each module is fine to decide while coding; this doc only pins down the ONE thing that causes real rework if backend and frontend drift apart independently: the shape of data passed between them.

## 1. Repo Structure

```
algae-carbon-platform/
├── backend/
│   ├── simulator/        # Phase 1 — sensor + imagery data generation
│   ├── engine/           # Phase 2 — growth/CO2 calculation
│   ├── verification/     # Phase 3 — reconciliation & flagging logic
│   ├── reporting/        # Phase 5 — report assembly (the [Report Export] node
│   │                     #   below); sits above engine + verification so it
│   │                     #   composes them rather than either importing the other
│   ├── api/               # route handlers, wraps engine + verification
│   └── data/              # seeded CSVs / DB
│   └── static/           # Phase 6 — the built SPA, in the Docker image only.
│                         #   Not in the repo: the image builds it (see Dockerfile)
├── frontend/
│   ├── src/
│   │   ├── pages/         # SiteOverview, SiteDetail, Report
│   │   ├── components/    # charts, status badges, stat tiles, filters
│   │   └── api/            # fetch client
│   └── .npmrc             # Phase 6 — pins the public npm registry, so the
│                          #   lockfile stays portable off this machine
├── Dockerfile             # Phase 6 — node builds, python runs, one image
├── render.yaml            # Phase 6 — Render blueprint (the deploy, in the diff)
├── prd.md
└── architecture.md
```

**Deployment shape (Phase 6).** One service, one origin: the same uvicorn process
answers `/api/...` and serves the built frontend. `app.py` mounts the static
build **after** the API router, so API paths win and a mistyped one still gets a
JSON 404. Nothing proxies anything in production — the Vite proxy in
`vite.config.js` is a dev-time convenience only, which is why the Phase 6 gate
refuses to run through it.

## 2. Data Flow (recap)

```
[Sensor Simulator] ---\
                        >---> [Reconciliation Engine] ---> [API] ---> [Frontend Pages]
[Sentinel-2 Index]  ---/                                              |
                                                                       v
                                                              [Report Export]
```

## 3. API Contract

All responses are JSON. This is the one interface both sides must agree on — build your backend to return exactly this shape, and build the frontend to expect exactly this shape, so Phase 4 doesn't need to reverse-engineer Phase 2/3.

### `GET /api/sites`
List view for the Site Overview screen.
```json
[
  {
    "site_id": "site-a",
    "name": "Site A — Raceway 1",
    "species": "Chlorella vulgaris",
    "operator": "Earthrise Nutritionals",          // groups the overview
    "location": "Calipatria, California, USA",     // shown in the facility picker
    "co2_sequestered_kg": 1920,
    "status": "verified",           // "verified" | "needs_review"
    "trend": [12, 14, 18, 22, 27, 31]   // sparkline points
  }
]
```

### `GET /api/sites/:site_id`
Site metadata for the Site Detail header.
```json
{
  "site_id": "site-b",
  "name": "Site B — PBR 2",
  "species": "Spirulina",
  "pond_type": "photobioreactor",
  "pond_area_m2": 420,
  "commissioning_date": "2025-03-01",
  "status": "needs_review"
}
```

### `GET /api/sites/:site_id/readings?range=6w`
Sensor time series for the trend chart (sensor line).
```json
{
  "site_id": "site-b",
  "series": [
    { "date": "2026-08-01", "biomass_density_g_L": 1.1, "co2_uptake_cum_kg": 240,
      "water_temp_C": 26.8, "pH": 8.1, "dissolved_O2_mg_L": 8.7,
      "dissolved_CO2_mg_L": 15.2, "turbidity_NTU": 34 }
  ]
}
```

### `GET /api/sites/:site_id/imagery-index?range=6w`
Satellite proxy series (dashed line in the chart).
```json
{
  "site_id": "site-b",
  "series": [ { "date": "2026-08-01", "ndci_value": 0.42 } ]
}
```

### `GET /api/sites/:site_id/verification`
Powers the Verification Status panel.
```json
{
  "site_id": "site-b",
  "status": "needs_review",
  "divergence_pct": 18,
  "tolerance_pct": 15,
  "explanation": "Sensor-reported CO2 uptake trending above satellite proxy for 2 consecutive weeks."
}
```

### `GET /api/sites/:site_id/report`
Powers the Investor/Credit Report screen.
```json
{
  "site_id": "site-a",
  "report_id": "AT-2026-0091",
  "generated_at": "2026-09-12",
  "reporting_period": "Weeks 1-6, 2026",
  "co2_sequestered_kg": 1920,
  "status": "verified",
  "agreement_pct": 96.4
}
```

**As shipped (Phase 5)** — same seven keys and types; two of the *values* are
shaped differently from this sketch, deliberately:

- `report_id` is `AC-<period year>-<6 hex>`, a fingerprint of what the report
  claims (site, period, CO2 figure, verdict, rule) rather than a serial like
  `0091`. A counter implies an issuing registry this platform is not, whereas a
  fingerprint is reproducible across re-runs and cannot survive a doctored
  figure. Generation time is excluded from it on purpose.
- `reporting_period` carries the real dates — `"2026-08-01 to 2026-09-11
  (42 days)"` — since the window anchors on the last reading, not on calendar
  weeks. This exact string is part of what the id fingerprints, so the frontend
  prints it verbatim rather than re-formatting it.
- `agreement_pct` is `100 − |peak divergence|`, the same peak the Phase 3
  verdict was made on. Scoring against the *latest* or *mean* divergence would
  let a generous number sit next to a "Needs review" badge.

## 4. What NOT to over-build

- No auth/multi-tenant — single demo session is enough.
- No live satellite API call at runtime — `imagery-index` is served from precomputed data (see PRD §5 risk mitigation).
- No function-level design beyond this contract — decide internal structure while coding each phase, and note what you actually built in the PRD's phase checklist as you verify it, not before.

## 5. Working method from here

1. Build backend Phases 1–3 against this contract (mock the frontend calls with `curl`/Postman to verify each response shape before moving on).
2. Build frontend Phase 4 against this same contract, using the design canvas as the visual reference.
3. Update the phase checklists in `prd.md` as each phase is verified — that log IS your documentation. Don't write it upfront; write it as each phase passes its verification gate.
