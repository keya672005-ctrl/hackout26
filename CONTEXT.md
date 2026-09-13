# HackOut'26 — Project Context (continue here in VS Code)

**Product name:** BioFix · **Team:** Pixel Error · **College:** Adani University · **Track:** Circular Carbon Ecosystem

## What we're building

**Algae-Based Carbon Sequestration Monitoring Platform** — a monitoring platform that cross-verifies on-site IoT sensor data against independent satellite imagery to produce a credible, auditable CO2-sequestration figure for algae cultivation sites (instead of trusting self-reported sensor numbers alone).

We picked this over 5 other candidate problem statements from the HackOut'26 brief (from Renewable Energy Intelligence and Circular Carbon Ecosystem tracks) after weighing 36-hour feasibility, demo impact, and how "seen before" each idea was. Started with the Consumer Carbon Loop App, then switched to this one.

## Files in this folder

- **`prd.md`** — full PRD: problem statement, proposed solution, approach, key features, tech stack, and the **7-phase build plan, each phase with its own verification checklist that must pass before the next phase starts**. This is the main reference — follow it phase by phase.
- **`architecture.md`** — lightweight architecture: repo folder structure + the fixed **API contract** (exact request/response JSON) between backend and frontend. Deliberately NOT a full function-call-graph — that goes stale immediately; decide internal function structure while coding.
- **`BioFix_Proposal.docx`** — the 2-page Word write-up for hackathon submission paperwork (Problem Statement / Proposed Solution / Approach / Key Features / Tech Stack, plain Times New Roman format, no branding baked in).

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
- [ ] **Phase 0 — Setup & Scoping** ← start here
- [ ] Phase 1 — Dataset & Reference Constants
- [ ] Phase 2 — Backend Growth & CO2 Engine
- [ ] Phase 3 — Verification / Reconciliation Engine
- [ ] Phase 4 — Frontend Dashboard
- [ ] Phase 5 — Reporting & Polish
- [ ] Phase 6 — Testing & Deployment
- [ ] Phase 7 — Pitch Prep

## How to continue

Open this folder in VS Code with Claude Code and start Phase 0 per `prd.md` §11: scaffold the repo per `architecture.md`'s folder structure, wireframe confirmed, get a stub endpoint running. Verify each phase against its checklist in `prd.md` before moving to the next — don't skip ahead. Update the checklist above (and in `prd.md`) as each phase is actually verified working; that running log is the project's documentation — no need to write more upfront.
