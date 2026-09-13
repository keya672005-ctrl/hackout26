# HackOut'26 — Project Context (continue here in VS Code)

**Team:** Pixel Error · **College:** Adani University · **Track:** Circular Carbon Ecosystem

## What we're building

**BioFix** — a monitoring platform that cross-verifies on-site IoT sensor data against independent satellite imagery to produce a credible, auditable CO2-sequestration figure for algae cultivation sites (instead of trusting self-reported sensor numbers alone).

We picked this over 5 other candidate problem statements from the HackOut'26 brief (from Renewable Energy Intelligence and Circular Carbon Ecosystem tracks) after weighing 36-hour feasibility, demo impact, and how "seen before" each idea was. Started with the Consumer Carbon Loop App, then switched to this one.

## Files in this folder

- **`prd.md`** — full PRD: problem statement, proposed solution, approach, key features, tech stack, and the **7-phase build plan, each phase with its own verification checklist that must pass before the next phase starts**. This is the main reference — follow it phase by phase.
- **`architecture.md`** — lightweight architecture: repo folder structure + the fixed **API contract** (exact request/response JSON) between backend and frontend. Deliberately NOT a full function-call-graph — that goes stale immediately; decide internal function structure while coding.
- **`script.txt`** — the 7-minute walkthrough script for the submitted video: ten timed sections, what to show beside what to say, plus the full tech stack with versions and every figure it quotes, so a number can be checked without stopping the recording. Plain text on purpose — it is read while recording, not rendered.
- **`BioFix_Proposal.docx`** — the 2-page Word write-up for hackathon submission paperwork (Problem Statement / Proposed Solution / Approach / Key Features / Tech Stack, plain Times New Roman format, no branding baked in).

## Key technical decisions already made (don't relitigate these)

- **Sensor data is simulated**, not read from real hardware — logistic growth curve modulated by a diurnal light/temperature cycle, with realistic noise. No real IoT devices needed.
- **CO2 conversion constant: ~1.8 kg CO2 fixed per kg dry algae biomass** — derived from ~50% carbon content in biomass and the CO2/C molecular-weight ratio (~3.67), backed by published microalgae biofixation studies (Chlorella vulgaris / Nannochloropsis).
- **Satellite verification uses real, free Sentinel-2 imagery** (Copernicus / ArcGIS ImageServer), reduced to one simple vegetation/chlorophyll index (NDVI/NDCI) — NOT a full computer-vision pipeline. Precompute and cache these values before the demo; never call the imagery API live on stage (deployment risk).
- **Verification logic** = compare the sensor-derived CO2 trend against the imagery-derived proxy over a rolling window; flag "Verified" if within tolerance (e.g. ±15%), else "Needs Review." This reconciliation logic is the actual differentiator/AI-ML story — frame it that way in the pitch, not as raw sensor dashboards.
- **Explicitly out of scope** (protects the 36-hour timeline): no auth/multi-tenant, no live blockchain/credit-registry integration, no real hardware, no on-stage live satellite API calls.

## Design

The interface ships **two themes off one token set**, and every rule in `src/index.css` is written against tokens only -- which is what makes a second theme (and the print stylesheet, which is a third) cost a dozen declarations instead of a parallel set of overrides.

- **Dark is the default**: a deep ocean ground (`#050e13`) with a slow four-wash aurora behind everything, glass panels (translucent `--surface` + `backdrop-filter`) that are translucent *to* that aurora, and teal that actually glows. The aurora and `--surface`'s alpha move together and should stay that way: the stronger the ground, the more of it bleeds through a panel, and body copy has to stay readable over whichever wash happens to sit behind that card. Algae is the one subject where bioluminescence is not a gimmick.
- **Light is `:root[data-theme='light']`** and is the **Phase 0 design canvas palette intact** -- teal `#0f766e`, amber for "needs review", slate ink on white, `#f8fafc` page. It is not a lesser fallback: it is what to switch to when a projector flattens the darks into one grey, which is the failure the toggle exists for. An editorial moss/bone repaint was tried after the mid-eval and **rejected on sight**; that is why the light theme is the canvas palette and not a third invention.
- The switch is `frontend/src/components/ThemeToggle.jsx`, flipping `data-theme` on `<html>` and remembering the choice in `localStorage`. **An inline script in `index.html` sets the attribute before first paint** -- React cannot, because by the time it mounts the browser has already painted the default and a reader who chose light watches the page flash dark on every load.
- **Typography is split, not single-family.** Times carries the display voice (page titles, figure titles, site names, the big numbers); the system sans carries the interface (labels, badges, controls, body copy); a real mono carries report ids and periods. Times alone read as unstyled next to other teams' dashboards -- the serif keeps the editorial gravitas exactly where it is legible as deliberate. All three stacks name the Liberation / DejaVu / Nimbus substitutes, because the Docker image has none of the Windows faces. **No webfonts, ever**: `scripts/demo.js` fails the build if the shell or its assets reference a single external origin.
- **Exactly one accent panel per screen**, and no more: the masthead on the overview, the headline CO2 tile on the site screen, the certified-figure card on the report. Each carries a rim-light hairline and a slow gradient pan. All three revert to ink on white in print, because a printer that drops backgrounds would otherwise drop their white text with them.
- Charts keep the canvas series colours in light (sensor `#2a78d6`, satellite `#eb6834`) and lift both in lightness for dark (`#5aaeff` / `#ff9152`). The hue opposition doing the colour-blind separation is blue vs orange, so it survives the theme. Deliberately neither the brand teal nor the status amber.
- **Motion is decoration over a resting state that is already correct.** Cards fade up on a stagger, plots wipe in left to right (on the recharts *wrapper*, so it cannot disturb the dasharray that distinguishes the satellite series), sparklines draw themselves (`pathLength={1}`), the divergence gauge grows, the review badge's halo pulses. Every from-state lives in a keyframe and never in the element's own rule -- kill the animation for print or for `prefers-reduced-motion` and the element is simply *there*. An entrance that hides its own content when disabled is how a report exports blank.
- **The big numbers are never animated.** The Phase 4/5/6 gates read `.tile-value`, `.hero-value` and `.site-figure-value` `textContent` and compare it to the API, so a count-up would read "0" mid-flight and fail a 90-second gate. Depth and motion everywhere else; the figures are correct from frame one.
- **The logo is the argument.** One algae leaf: the solid half is the sensor record, the dashed half the independent satellite proxy drawn against it -- they only close into a leaf when the two agree. `frontend/public/favicon.svg` is both the favicon and the header mark. It is still in its own greens (from the original artwork) rather than the UI teal.

(The design canvas is a hosted link in the Cowork conversation this context came from — if you need to re-open it, ask there rather than recreating it from scratch.)

## Repo

**https://github.com/keya672005-ctrl/hackout26** — owned by Keya; push as the **`Saurabh-2342`** GitHub account, which is the one holding collaborator Write access. The `Saurabh-050570` account on this machine has read-only access and gets a 403, so if a push is denied, check `gh api user --jq .login` before anything else (`gh auth switch` flips between them).

## Current status

- [x] Problem selected, feasibility-checked
- [x] PRD written (`prd.md`)
- [x] Architecture + API contract written (`architecture.md`)
- [x] Dashboard design mockups built (3 screens, one direction chosen)
- [x] **Phase 0 — Setup & Scoping** — repo scaffolded, stack locked (FastAPI + React/Vite), `npm run dev` runs both, `/api/ping` returns 200 (see `prd.md` §11 Phase 0 for details)
- [x] **Phase 1 — Dataset & Reference Constants** — **6 raceway blocks across 2 real facilities** (Earthrise CA x3, Cyanotech HI x3; Parry Oonaiyur dropped as not resolvable), each block delineated from the imagery itself by connected-component labelling the temporal-median NDCI *inside* the facility footprint Phase 1 validated, real Sentinel-2 NDCI cached to `data/imagery_index.csv`, seeded sensor simulator, CO2 constants = 1.8321. 38/38 checks pass via `backend/verify_phase1.py`
- [x] **Phase 2 — Backend Growth & CO2 Engine** — `engine/store.py` + `engine/co2.py` turn hourly readings into cumulative CO2 fixed (gross production × 1.8321, no back-filling of missing hours); `/api/sites`, `/api/sites/:id`, `/api/sites/:id/readings`, `/api/sites/:id/imagery-index` live and matching the contract. 47/47 checks pass via `backend/verify_phase2.py` (see `prd.md` §11 Phase 2 for details)
- [x] **Phase 3 — Verification / Reconciliation Engine** — `verification/reconcile.py` compares reported biomass density against the satellite NDCI as normalised trends over RULE-001's 14-day rolling window; `/api/sites/:id/verification` live, and `status` is now a real verdict everywhere (site-a verified, site-b needs_review). 34/34 checks pass via `backend/verify_phase3.py` (see `prd.md` §11 Phase 3 for details)
- [x] **Phase 4 — Frontend Dashboard** — three hash-routed screens (overview, site detail, report) wired to the live API, sensor-vs-satellite trend chart with both signals indexed to 100, verification panel plotting divergence against its tolerance. The overview is an **operator dashboard**: scoped by region or facility (one <select>, two optgroups, both derived from the API), plus a per-browser **watchlist** — tick the blocks you are responsible for and the strip totals exactly those, CO2 fixed and the verified/flagged split of it. 120/120 checks pass via `node verify_phase4.mjs` in `frontend/` — it drives the production build in headless Chrome and compares every on-screen figure against the API response behind it (see `prd.md` §11 Phase 4 for details)
- [x] **Phase 5 — Reporting & Polish** — `reporting/report.py` + `GET /api/sites/:id/report` assemble the credit-readiness document (report id as a content fingerprint, `agreement_pct` = 100 − peak divergence); the Report screen exports via `window.print()` against a print stylesheet, A4, no PDF dependency. 184/184 checks pass via `node verify_phase5.mjs` in `frontend/` — it renders the real PDF through Chrome and cross-checks every figure against four independent sources (see `prd.md` §11 Phase 5 for details)
- [~] **Phase 6 — Testing & Deployment** — the app now deploys as **one service on one origin**: FastAPI serves the built SPA itself (`Dockerfile` + `render.yaml`, Render free plan, health check on `/health`). 128/128 checks pass via `node verify_phase6.mjs` in `frontend/`, and 116/116 against the **Docker image itself** via `node verify_phase6.mjs --target http://127.0.0.1:8123`. Live at **https://algae-carbon-platform.onrender.com**, now serving `016b46c` (the dark theme and the aurora) — **125/125** against the deployed service via `node verify_phase6.mjs --target https://algae-carbon-platform.onrender.com`, with the deployed JS, CSS and favicon matching `frontend/dist` by SHA-256 byte for byte. **Remaining:** open the link on a real phone and tick that item by hand (see `prd.md` §11 Phase 6)
- [~] **Phase 7 — Pitch Prep** — the stage fallback is built: `npm run demo` brings the whole platform up on one local port in the deployed single-origin shape, with no internet at all, and self-checks before it opens the browser (`npm run demo:check` to just run the checks). `DEMO.md` is the printed card — which link to demo, the five beats, and what to do when something breaks. The **deck is built** in two forms off one set of figures, both pulled live from the deployed API rather than retyped: `BioFix_Deck.pptx` (a real PowerPoint -- native text and vector shapes, editable, regenerate with `python scripts/make_deck.py`, needs `python-pptx`) and a published HTML deck that presents from a browser tab and carries the same light/dark projector toggle the product does. **Remaining:** the spoken run-throughs. The *timing* half is now automated -- `npm run demo:time` drives DEMO.md's six beats against the deployed link twice and reports per-beat wall-clock (**9.8s / 7.4s** of click-time against a 180s budget, so ~170s is free for narration)

## Gotchas worth keeping

### The file that reverted underneath us, and `git add -A` that committed it

This repo lives inside **OneDrive** (`C:\Users\singh\OneDrive\Desktop\Hackout`). During the BioFix rename, `CONTEXT.md` was observed **reverting to a much older 48-line version** mid-session: a scripted replacement reported one substitution, and a read moments later found the old string still there. The next `git add -A` then committed the reverted file, silently deleting 52 lines — the whole phase log — inside a commit whose message was about renaming a product.

Recovered with `git show <prev>:CONTEXT.md > CONTEXT.md`, which is the whole reason the running log is committed after every phase rather than kept in one long-lived working copy.

Two habits fall out, both cheap:

- **Before any `git add -A`, read `git diff --numstat`.** A file that lost far more lines than the change should touch is the signal. Here it read `12 added, 52 removed  CONTEXT.md` in a rename that should have been one-for-one, and every other file in that commit was symmetric.
- **Do not trust a write you did not read back**, for documents in this folder specifically. A scripted edit that reports success can still be overwritten by the sync client a second later.
### The free instance is asleep when you need it

The Render service is on the **free plan**: it spins down after ~15 minutes with no traffic and cold-starts in roughly 30–60s on a 444 MB image. On stage that reads as a broken link, not a slow one. Open https://algae-carbon-platform.onrender.com a couple of minutes before demoing. It was also created from the **public repo URL**, not a linked GitHub account (the repo is Keya's — only she can install Render's GitHub app), so `render.yaml` is *not* auto-applied and there is **no auto-deploy on push**: after a `git push`, redeploy by hand from the Render dashboard or nothing changes.

This bit once. The dark theme and the aurora were committed and pushed, and the live link went on serving the previous build for a whole session — **pushed and deployed are separate facts here, and "is it pushed?" does not answer "is it live?"**. The fastest way to tell which build is actually answering is to compare what the server sends against the local one: `curl -s <url>/ | grep assets/` and check the hashed filenames against `frontend/dist/index.html`, or SHA-256 the assets themselves. Vite hashes on content, so identical names mean identical bytes. Then re-run `node verify_phase6.mjs --target <url>`.


### The stale server that keeps answering

`npm run dev` now **refuses to start** if port 8000 or 5173 is already held, and prints the command to free it. That is deliberate: uvicorn logs "Application startup complete" *before* it binds, so a stale server from an earlier session keeps the port, the new process dies with a one-line errno, and the frontend quietly talks to a backend built from source that no longer exists. It surfaces as a mystery 404 in the browser, not as a crash in the terminal — it cost most of Phase 4 once. On Windows kill the uvicorn *child* too; it inherits the listening socket and outlives its parent.

### The lockfile that only builds on this machine

`frontend/package-lock.json` had all 106 packages resolved to `https://nexus.iqm.services` — a corporate npm mirror picked up from this machine's global `~/.npmrc`. It installs perfectly here and fails with `401 Unable to authenticate` in **any** build that is not here, including Render's. It is now rewritten to `registry.npmjs.org`, `frontend/.npmrc` pins the public registry so the next `npm install` cannot undo that, and the Phase 6 gate fails if a private host ever reappears in the lockfile. If you add a dependency and the deploy suddenly 401s, look here first.

### A gate can pass on its own comment

The Phase 6 check for "the container honours `$PORT`" originally grepped the whole Dockerfile — and matched the *comment* explaining why `$PORT` matters, so it still passed after the canary hard-coded the port. It now reads the `CMD` line only. When a check greps a file, make sure it greps the part that does the work.

### The print stylesheet that printed the dark theme

`@media print` re-points the design tokens at ink rather than overriding each rule, which is what lets paper be a third theme for a dozen declarations. But the themes are **attribute-qualified** (`:root[data-theme='dark']`, specificity 0-1-1) and a bare `:root` in the print block is 0-0-1 -- so the dark theme outranks the print block and the PDF exports on a black ground with white text that half the printers in the world will drop. The print block now names all three selectors (`:root, :root[data-theme='dark'], :root[data-theme='light']`). If you add a fourth theme, add it there too.

The same block also kills `animation` and `transition` globally, for a related reason: every entrance on the platform starts from `opacity: 0` in its keyframe, and a panel caught mid-entrance by `printToPDF` exports blank. The rule that makes this safe is that **a from-state lives in a keyframe and never in the element's own rule** -- so disabling animation leaves the element visible, not hidden. Phase 5 renders the real PDF and would catch a violation, but only if you run it.

## How to continue

Open this folder in VS Code with Claude Code and finish **Phase 6** — only the **real-device pass** is left, the deploy is current and verified at 125/125 — then finish **Phase 7 — Pitch Prep** per `prd.md` §11. `npm run dev` from the project root brings up both services; the phase gates are `python verify_phase1.py` / `verify_phase2.py` / `verify_phase3.py` in `backend/` and `node verify_phase4.mjs` / `verify_phase5.mjs` / `verify_phase6.mjs` in `frontend/` (the last three share the browser harness in `verify_lib.mjs`; note Phase 6 boots the **single-origin production shape**, not Vite, and takes `--target <url>` to run the same checks against a real deployment), and all six should stay green as later phases land. Verify each phase against its checklist in `prd.md` before moving to the next — don't skip ahead. Update the checklist above (and in `prd.md`) as each phase is actually verified working; that running log is the project's documentation — no need to write more upfront.
