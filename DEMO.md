# Demo card — HackOut'26, team Pixel Error

Print this. Anyone on the team should be able to drive the demo off this page
without asking anyone else what to click.

---

## Which link do I demo?

**Primary — the deployed service:** https://algae-carbon-platform.onrender.com

**Fallback — this laptop, no internet needed:**

```
npm run demo
```

One command, from the project root. It builds if the build is stale, serves the
API and the dashboard from one local port, checks the demo is intact, prints the
URL and opens the browser. Ctrl+C stops it.

### Use the fallback when

- the venue wifi is down, captive-portalled, or crawling
- the Render link is still spinning after ~60 seconds (the free instance sleeps
  after 15 minutes idle and cold-starts slowly)
- anything on the deployed page looks wrong and you have 20 seconds to decide

You do not need to explain the switch. "We run this locally too — it has no
cloud dependency" is a feature of the architecture, so say that instead.

---

## Before you go up — 2 minutes

1. `npm run demo:check` — runs every check and exits. All green means this
   machine can carry the demo alone.
2. Open the Render link and leave the tab open, so the instance is warm.
3. Have `npm run demo` already running in a terminal, browser tab open on the
   overview. Switching tabs is instant; starting a server while judges watch is
   not.
4. Close Docker Desktop and spare VS Code windows. This machine has 7.7 GB and
   the demo is the only thing that matters for the next ten minutes.
5. Glance at the room. If the projector is washing out the darks, switch to the
   light theme now with the button at the top right — not mid-demo. The choice
   is remembered, so it survives the tab switch to the fallback.
6. **Start with an empty watchlist.** It is remembered per browser, so a
   rehearsal leaves blocks ticked. Switch to **My watchlist**, hit **Clear**,
   then back to **All blocks**. Beat 4 is the act of picking; it does not land
   if the blocks are already picked.

---

## The run — seven beats

| # | Do | Say |
|---|---|---|
| 1 | Overview screen | Six raceway blocks across two real facilities — Earthrise in California, Cyanotech in Hawaii. Each one is measured separately, because a facility does not fail verification, a pond does. |
| 2 | **Scope** dropdown → Earthrise Nutritionals | All three Earthrise blocks reconcile against the satellite record. The same control scopes by region, for an operator who thinks in geography rather than in company names. |
| 3 | Scope → Cyanotech Corporation | All three Cyanotech blocks are flagged. The platform is not asserting fraud — it is saying these claims are not supported by the imagery, and should not be published as credits until someone looks. |
| 4 | Back to **All blocks**. Tick **Watch** on two blocks → **My watchlist** | An operator does not run six ponds, they run the ones they are responsible for. Pick those and the dashboard totals exactly them — CO₂ fixed, and how much of it the imagery actually supports. |
| 5 | **All blocks** again, open a verified block | Sensor-reported biomass against an independent Sentinel-2 chlorophyll index, both indexed to 100. They move together. |
| 6 | Verification panel | Peak divergence against a 15% tolerance. RULE-001 found no sustained disagreement, so the figure is publishable. |
| 7 | Open a flagged block → then a verified block's **report** → Print / Save as PDF | Same two lines, coming apart. And this is the artifact a verifier receives for one that passed — the report id is a fingerprint of the figures in it: change any published number and the id changes. |

**Closing line:** *We don't just show sensor numbers — we prove them.*

---

## If something breaks

| What you see | Do this |
|---|---|
| Render link hangs > 60s | Switch to the local tab. Do not reload and wait. |
| Local page is blank | `Ctrl+C`, then `npm run demo` again — it rebuilds on start. |
| "port is busy" in the output | Nothing to do, it takes the next port and prints the URL it actually used. |
| A chart is empty | Check the reporting window filter is on **6 weeks**. |
| The grid is empty | You are in **My watchlist** with nothing ticked. Hit **All blocks** — it is the left button of the *Showing* pair, not the *Reporting window* one. |
| A judge asks whose watchlist it is | Straight answer: this browser's. There is no auth in this build, so there is no account to hang it on, and the screen says so rather than implying one. |
| Print dialog won't open | The report page still shows every figure on screen — read them off it. |
| The projector washes the screen out | Hit the ☀/☽ button at the top right. It switches to the light theme, which is high-contrast ink on white and survives a bad projector. One click, no reload. |
| Laptop dies entirely | The deployed link works from any phone, including on mobile data. |

---

## What to say if a judge asks what's real

Be straight about this — it is a stronger answer than hedging.

- **Real:** the Sentinel-2 imagery indices (Copernicus, cached before the demo),
  the CO2 conversion constant (1.8321 kg CO2 per kg dry biomass, from published
  microalgae biofixation work), both facilities, the **pond blocks themselves**
  — each was delineated from the imagery by clustering pixels that hold
  chlorophyll across every date, which is why the rectangles line up with the
  raceway channels — the reconciliation logic, and every figure on screen,
  which is computed by the backend and never in the browser.
- **Worth saying out loud if Cyanotech comes up:** all three of its blocks are
  flagged. That is what this dataset produces, not a claim about the company —
  the sensor stream is simulated, and its blocks have sparser cloud-free
  imagery (6 usable dates against Earthrise's 9), so the comparison has less to
  go on. A verifier reading "needs review" is being told to look, not told
  someone lied.
- **Simulated:** the sensor stream — a logistic growth curve with a diurnal
  cycle and noise, standing in for pond hardware we do not have.
- **Out of scope, deliberately:** auth, multi-tenancy, a live credit registry,
  and permanence. We report carbon as *fixed*, not as permanently sequestered,
  because what happens to harvested biomass is outside what this platform can
  see.
