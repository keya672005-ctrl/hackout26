# Video walkthrough script — 7:00

BioFix · HackOut'26 · team Pixel Error.

Nine sections, timed to 7:00. **Show** is what to have on screen; **Say** is
written to be read aloud. Every figure quoted here is what the running service
returns — the table at the bottom is there so you can check one without
stopping. There is a timed version of this page with a running clock, linked in
the session notes.

Word counts assume ~160 wpm. If you are running long, the two sections with
slack are **3 (the data)** and **6 (the walkthrough)** — both are description
rather than argument.

---

## 1 · The problem — 0:00–0:35 (~92 words)

**Show:** open on the BioFix overview, six blocks visible. Do not click anything
yet; let the screen sit still while you set up the problem.

**Say:**

> Algae ponds fix carbon dioxide faster per hectare than forest, and carbon
> credits are issued against that. But the number that sets the price comes from
> sensors in the operator's own ponds, read by the operator's own software, and
> handed to a verifier as a spreadsheet.
>
> The seller owns the instrument, owns the number, and owns the incentive. A pond
> that simply underperformed and a pond that was over-reported produce exactly
> the same document — and the verifier holding it has no second source to tell
> them apart.
>
> *This is BioFix.*

---

## 2 · What it does — 0:35–1:15 (~105 words)

**Show:** any site detail screen, both trend lines visible. Point at the solid
line, then the dashed line, as you name them.

**Say:**

> BioFix is a verification layer. It takes the operator's sensor record, converts
> it to carbon dioxide fixed, and then checks that against something the operator
> does not control: free Sentinel-2 satellite imagery of the same pond, over the
> same days.
>
> Two records that share no input, compared by one stated rule. Where they agree,
> the figure is publishable. Where they come apart, the block is flagged for
> review.
>
> **Flagged, not accused.** The platform never claims fraud — it says this claim
> is not supported by the imagery, and a human should look before it becomes a
> credit.

---

## 3 · The data, and where it came from — 1:15–2:15 (~160 words)

**Show:** overview, then the **Scope** dropdown → Earthrise, then Cyanotech. Cut
to satellite imagery of a facility if you have it. `backend/data/sites.csv` is a
good cutaway for the coordinates.

**Say:**

> The sites are real. Earthrise Nutritionals at Calipatria in California's
> Imperial Valley, growing *Spirulina platensis*; and Cyanotech, at Keahole Point
> on Hawaii, growing *Haematococcus pluvialis*. Both are operating commercial
> raceway farms, and we hold their real coordinates.
>
> We monitor **six raceway blocks**, not two farms — because a farm does not fail
> verification, a pond does. And the blocks were **found in the imagery, not drawn
> by hand**: we took the median chlorophyll index per pixel across the window,
> kept only pixels holding chlorophyll on *every* date, and clustered those into
> blocks. The rectangles land on the raceway channels you can see in the scene.
>
> A third candidate farm was cut for exactly this reason — we could not separate
> its ponds from surrounding cropland. A chlorophyll index cannot tell a raceway
> from an alfalfa field.

---

## 4 · The formula — 2:15–3:10 (~150 words)

**Show:** cut to `backend/engine/constants.py`. The derivation is written in the
file; highlight the two constants and the multiplication.

**Say:**

> So where does the carbon number come from? Dry microalgal biomass is about
> **fifty percent carbon by mass**. Oxidising that carbon back to carbon dioxide
> multiplies it by the molecular weight ratio of CO₂ to carbon — 44.01 over
> 12.011, which is 3.664.
>
> Half of that is **1.8321 kilograms of CO₂ per kilogram of dry biomass**. That is
> the whole conversion, and it is a published reference value from microalgae
> biofixation work — not a number we fitted to make the demo work.
>
> Biomass comes from growth per hour across the pond volume, at a working depth of
> 25 centimetres, the industry norm for an open raceway. And we count **gross
> production only, and never back-fill a missing hour**. If the sensor did not
> report, that hour contributes nothing. Missing data stays missing.

---

## 5 · The method — RULE-001 — 3:10–4:00 (~135 words)

**Show:** `backend/verification/rules.py` — all four thresholds are visible at
once. Then back to a site detail screen, on the verification panel.

**Say:**

> You cannot compare the two signals directly — one is kilograms, the other a
> dimensionless band index. So both are **normalised to 100** at the start of the
> window and compared as trends, not as absolute values.
>
> That comparison is **RULE-001**: a 14-day rolling window, a 15 percent
> tolerance, and a block must breach on **two consecutive days** before it is
> flagged — one noisy day is not an accusation.
>
> Two more guards. A day with less than half a day of sensor coverage is dropped
> rather than back-filled. And any acquisition more than 35 percent cloudy is
> discarded, because a cloud index is not a chlorophyll index.
>
> The thresholds are configuration, not code. *A verifier can point at the rule
> that fired.*

---

## 6 · The walkthrough — 4:00–5:30 (~235 words)

The longest beat. **Slow down here** — this is the part judges watch.

**Show:** Overview. **Scope** → region, then facility. Tick **Watch** on two
blocks → **My watchlist**, show the totals strip. Back to **All blocks**. Open
**Earthrise Block A**, scroll to the verification gauge. Then open **Cyanotech
Block A** and let the diverging lines sit on screen.

**Say:**

> Here is the dashboard. Six blocks, and I can scope them by region or by
> operator.
>
> An operator does not run six ponds — they run the ones they are responsible for.
> So I can tick those, and the dashboard totals exactly those: carbon dioxide
> fixed, and how much of it the imagery actually supports.

*(beat — open Earthrise Block A)*

> This is a verified block. The solid line is sensor-reported biomass; the dashed
> line is the satellite chlorophyll index. Both indexed to 100, and they move
> together. Peak divergence **12.6 percent** against a 15 percent tolerance,
> currently 1.4. No sustained disagreement, so the figure is publishable.

*(beat — open Cyanotech Block A)*

> And this is what the other answer looks like. The same two lines, coming apart.
> Reported biomass ran up to **19 percent** above the satellite proxy, and stayed
> outside tolerance for **21 consecutive days** of the 28 compared. Needs review.
>
> And I want to be straight about why. Cyanotech's blocks have six cloud-free
> acquisitions in this window against Earthrise's nine. Thinner evidence is itself
> a reason a verifier should look — which is precisely what the platform is saying.

---

## 7 · The report, and its fingerprint — 5:30–6:20 (~135 words)

**Show:** from Earthrise Block A, open its **report**. Point at the report id,
then the figure, then the agreement number. Click **Print / Save as PDF** and let
the dialog appear.

**Say:**

> This is the artifact a verifier actually receives. 45,624 kilograms of CO₂ fixed
> over a 42-day reporting period, 87.4 percent agreement with the imagery, verdict
> verified, under RULE-001.
>
> And the report id is not a serial number. It is a **SHA-256 over what the report
> asserts** — the site, the period, the figure, the verdict, the rule.
>
> Two things follow. Re-run this on the same data and it mints *the same id*, so a
> screenshot from yesterday still matches the running system. And move the
> published figure by one hundredth of a kilogram and the id changes completely.
>
> The timestamp is deliberately **excluded** from that hash. Otherwise the same
> data would mint a new identity on every refresh, and the id would prove nothing.

---

## 8 · What's real, and what we left out — 6:20–6:45 (~70 words)

**Show:** back to the overview, or hold on the report. Say this one straight to
camera if you can — it lands better than a screen.

**Say:**

> To be straight with you: the imagery is real, the farms are real, the blocks are
> real, the constant is published, and every figure on screen is computed in the
> backend. **The sensor stream is simulated** — which is the honest shape of this
> problem, because the sensor side is exactly the side nobody should have to take
> on trust.
>
> And we report carbon as *fixed*, not as permanently sequestered. What happens to
> harvested biomass is outside what this platform can see, so we do not claim it.

---

## 9 · Close — 6:45–7:00 (~40 words)

**Show:** overview, six blocks, hold still. End card: BioFix, the URL, team name.

**Say:**

> Six ponds, two real farms, one instrument the operator does not own, and one
> rule that says out loud when the numbers stop agreeing.
>
> *BioFix. We don't just show sensor numbers — we prove them.*

---

## Every number in this script

| The conversion | |
|---|---|
| Carbon fraction of dry biomass | 0.50 |
| CO₂ / C molecular weight | 44.01 / 12.011 = 3.664 |
| **kg CO₂ per kg dry biomass** | **1.8321** |
| Raceway working depth | 0.25 m |

| RULE-001 | |
|---|---|
| Tolerance | ±15% |
| Rolling window | 14 days |
| Consecutive breaches to flag | 2 |
| Minimum daily coverage | 0.5 |
| Max cloud fraction | 0.35 (max observed 0.006) |

| The dataset | |
|---|---|
| Raceway blocks | 6 |
| Hourly sensor readings | 6,048 |
| Imagery index rows | 45 |
| Cloud-free dates, Earthrise / Cyanotech | 9 / 6 |
| Pond area, six blocks | 252,000 m² |

| Block | Operator & place | Species | Pond area | CO₂ fixed | Verdict |
|---|---|---|---|---|---|
| Earthrise A | Earthrise, Calipatria CA | *Spirulina platensis* | 58,000 m² | 45,624 kg | Verified |
| Earthrise B | Earthrise, Calipatria CA | *Spirulina platensis* | 49,000 m² | 38,593 kg | Verified |
| Earthrise C | Earthrise, Calipatria CA | *Spirulina platensis* | 48,000 m² | 38,037 kg | Verified |
| Cyanotech A | Cyanotech, Keahole Pt HI | *Haematococcus pluvialis* | 44,000 m² | 15,770 kg | Needs review |
| Cyanotech B | Cyanotech, Keahole Pt HI | *Haematococcus pluvialis* | 35,000 m² | 10,825 kg | Needs review |
| Cyanotech C | Cyanotech, Keahole Pt HI | *Haematococcus pluvialis* | 18,000 m² | 5,489 kg | Needs review |

**Portfolio:** 154.3 t CO₂ reported across six blocks — 122.3 t supported by
imagery, 32.1 t held for review.

**The report shown:** `BF-2026-83D755` · 45,624 kg · 42-day period · 87.4%
agreement · 28 compared days.

---

## Before you hit record

1. **Wake the service.** The free Render instance sleeps after ~15 minutes and
   cold-starts in 30–60s. Open the link a couple of minutes early, or record
   against `npm run demo`, which needs no internet at all and is the same
   single-origin shape.
2. **Clear the watchlist.** It persists per browser, so a rehearsal leaves blocks
   ticked and section 6 stops being a demonstration of picking.
3. **Reporting window on 6 weeks.** Every figure in this script assumes it.
4. **Pick the theme for your capture.** Dark reads better on video; switch with
   the button at top right, and it survives a reload.
5. **Check the report id still reads `BF-2026-83D755`.** If it does not, the data
   changed and the figures in this script need re-checking before you record.
