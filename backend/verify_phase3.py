"""Phase 3 verification gate (PRD section 11).

Checks each box on the Phase 3 checklist against the real reconciliation engine
and the real API, and exits non-zero if any of them fails, so the gate cannot be
passed by assertion.

Two things make this gate worth trusting:

* **The divergence is recomputed independently.** The gate re-derives the whole
  comparison from the raw CSVs using nothing but the standard library -- its own
  daily means, its own linear interpolation, its own rolling window -- and never
  imports `verification.reconcile` to do it. If both paths agree, the agreement
  means something.
* **The detector is dosed, not just pointed at site-b.** Passing because site-b
  happens to be flagged would prove only that the engine recognises site-b. So
  the gate synthesises the *honest* site with a range of drifts injected into it
  and checks the response is monotonic and flips at the tolerance -- evidence
  the engine detects drift as such. It also checks the under-reporting
  direction, which the seed data never exercises.
"""

from __future__ import annotations

import csv
import shutil
import sys
import tempfile
from collections import defaultdict
from dataclasses import replace
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))
DATA = BASE / "data"

from fastapi.testclient import TestClient            # noqa: E402

import app                                           # noqa: E402
from engine import co2, store                        # noqa: E402
from verification import reconcile                   # noqa: E402
from verification.rules import ACTIVE_RULE           # noqa: E402

results: list[tuple[bool, str, str]] = []
client = TestClient(app.app)

RULE = ACTIVE_RULE
WINDOW = RULE.rolling_window_days
TOL = RULE.tolerance_pct / 100.0


def check(ok: bool, name: str, detail: str) -> None:
    results.append((bool(ok), name, detail))


# --- an independent restatement of the comparison, stdlib only --------------

def hand_divergence(data_dir: Path, site_id: str) -> list[tuple[str, float]]:
    """Re-derive the sensor-vs-satellite divergence from the raw CSVs.

    Deliberately does not import the engine: its own daily means, its own
    linear interpolation between acquisitions, its own rolling window.
    """
    # Daily mean reported density, straight from the hourly rows.
    buckets: dict = defaultdict(list)
    with (data_dir / "sensor_readings.csv").open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row["site_id"] == site_id:
                buckets[row["timestamp"][:10]].append(float(row["biomass_density_g_L"]))
    if not buckets:
        return []
    days = sorted(buckets)
    density = {d: sum(v) / len(v) for d, v in buckets.items()}

    # Acquisitions, cloud-screened, as (ordinal, value).
    acq: list[tuple[int, float]] = []
    with (data_dir / "imagery_index.csv").open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row["site_id"] == site_id and \
                    float(row["cloud_fraction"]) <= RULE.max_cloud_fraction:
                acq.append((_ordinal(row["date"]), float(row["ndci_value"])))
    acq.sort()
    if not acq:
        return []

    # Compare only inside the imagery span -- no extrapolation.
    lo, hi = acq[0][0], acq[-1][0]
    days = [d for d in days if lo <= _ordinal(d) <= hi]
    if len(days) < 2 * WINDOW:
        return []

    sensor = [density[d] for d in days]
    satellite = [_interp(_ordinal(d), acq) for d in days]

    def rolling(xs: list[float]) -> list[float]:
        return [sum(xs[i - WINDOW + 1:i + 1]) / WINDOW for i in range(WINDOW - 1, len(xs))]

    s_roll, n_roll = rolling(sensor), rolling(satellite)
    s_base, n_base = s_roll[0], n_roll[0]
    return [(days[WINDOW - 1 + i], (s_roll[i] / s_base) / (n_roll[i] / n_base) - 1.0)
            for i in range(len(s_roll))]


def _ordinal(iso_date: str) -> int:
    from datetime import date
    return date.fromisoformat(iso_date[:10]).toordinal()


def _interp(x: int, pts: list[tuple[int, float]]) -> float:
    """Linear interpolation between acquisitions, clamped at the ends."""
    if x <= pts[0][0]:
        return pts[0][1]
    if x >= pts[-1][0]:
        return pts[-1][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= x <= x1:
            return y0 if x1 == x0 else y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return pts[-1][1]


# --- fixture plumbing -------------------------------------------------------

def read_rows(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def write_rows(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


def make_dir(readings: list[dict], sites: list[dict] | None = None,
             imagery: list[dict] | None = None) -> Path:
    """A temp data dir the store can be pointed at."""
    tmp = Path(tempfile.mkdtemp(prefix="phase3-"))
    write_rows(tmp / "sensor_readings.csv", readings)
    write_rows(tmp / "sites.csv", sites or read_rows(DATA / "sites.csv"))
    write_rows(tmp / "imagery_index.csv", imagery or read_rows(DATA / "imagery_index.csv"))
    return tmp


def use_dir(tmp: Path) -> None:
    store.DATA_DIR = tmp
    for fn in (store.sites, store._all_readings, store._all_imagery):
        fn.cache_clear()


def restore() -> None:
    store.DATA_DIR = DATA
    for fn in (store.sites, store._all_readings, store._all_imagery):
        fn.cache_clear()


def drifted(rows: list[dict], site_id: str, drift: float) -> list[dict]:
    """Apply a linear reporting drift to one site, the way a mis-calibrated or
    dishonest logger would: it ramps in, so early dates still agree.

    Written out here rather than imported from the simulator -- the engine must
    detect the drift, and the gate must not hand it the answer.
    """
    out, idx = [], 0
    total = sum(1 for r in rows if r["site_id"] == site_id)
    for row in rows:
        if row["site_id"] != site_id:
            out.append(dict(row))
            continue
        ramp = 1.0 + drift * (idx / total)
        idx += 1
        out.append(dict(row,
                        biomass_density_g_L=f"{float(row['biomass_density_g_L']) * ramp:.4f}",
                        biomass_produced_kg=f"{float(row['biomass_produced_kg']) * ramp:.4f}"))
    return out


# === 1. a site with matching trends is correctly flagged "Verified" =========

verdict_a = reconcile.reconcile("site-a")
check(verdict_a.status == "verified",
      "site-a (honest record) is flagged Verified",
      f"status={verdict_a.status}, peak divergence {verdict_a.divergence_pct}% "
      f"vs {verdict_a.tolerance_pct}% tolerance, longest breach run "
      f"{verdict_a.longest_breach_run} day(s) over {verdict_a.days_compared} compared")

# 1b. the same numbers, re-derived from the CSVs without the engine
hand = hand_divergence(DATA, "site-a")
engine_frame = reconcile.divergence_series("site-a")
engine_div = list(zip(engine_frame["date"], engine_frame["divergence"]))
aligned = len(hand) == len(engine_div) and all(h[0] == e[0] for h, e in zip(hand, engine_div))
worst = max((abs(h[1] - e[1]) for h, e in zip(hand, engine_div)), default=1.0)
check(aligned and worst < 1e-3,
      "engine divergence matches an independent stdlib recomputation (site-a)",
      f"{len(hand)} days compared on the same dates, largest disagreement "
      f"{worst:.2e} (hand peak {max(abs(d) for _, d in hand):.1%})")

check(all(abs(d) <= TOL for _, d in hand),
      "the honest site never breaches tolerance on the hand-computed series",
      f"max |divergence| {max(abs(d) for _, d in hand):.1%} vs {TOL:.0%} tolerance")

# 1c. a site whose sensors track the satellite exactly must come out near zero,
#     which proves "verified" is earned rather than being the fall-through.
rows = read_rows(DATA / "sensor_readings.csv")
acq = [(_ordinal(r["date"]), float(r["ndci_value"]))
       for r in read_rows(DATA / "imagery_index.csv") if r["site_id"] == "site-a"]
acq.sort()
perfect = []
for row in rows:
    if row["site_id"] != "site-a":
        continue
    val = 4.0 * _interp(_ordinal(row["timestamp"][:10]), acq)
    perfect.append(dict(row, biomass_density_g_L=f"{val:.4f}"))
tmp = make_dir(perfect)
try:
    use_dir(tmp)
    v = reconcile.reconcile("site-a")
    check(v.status == "verified" and abs(v.divergence_pct) < 0.5,
          "a sensor record that tracks the satellite exactly diverges by ~0%",
          f"status={v.status}, peak divergence {v.divergence_pct}% "
          f"(synthetic site whose density is 4.0 x the NDCI curve)")
finally:
    restore()
    shutil.rmtree(tmp, ignore_errors=True)


# === 2. an injected artificial discrepancy is flagged "Needs Review" ========

verdict_b = reconcile.reconcile("site-b")
check(verdict_b.status == "needs_review"
      and verdict_b.longest_breach_run >= RULE.consecutive_breaches_to_flag,
      "site-b (34% injected reporting drift) is flagged Needs Review",
      f"status={verdict_b.status}, peak divergence {verdict_b.divergence_pct}% "
      f"vs {verdict_b.tolerance_pct}% tolerance, out of tolerance for "
      f"{verdict_b.longest_breach_run} consecutive days "
      f"(rule needs {RULE.consecutive_breaches_to_flag})")

check(verdict_b.divergence_pct > verdict_b.tolerance_pct
      and verdict_b.divergence_pct > verdict_a.divergence_pct,
      "the flagged site reports a divergence consistent with its own verdict",
      f"site-b {verdict_b.divergence_pct}% > tolerance {verdict_b.tolerance_pct}% "
      f"> site-a {verdict_a.divergence_pct}%")

ENGINE_SRC = (BASE / "verification" / "reconcile.py").read_text(encoding="utf-8")
check("REPORTING_DRIFT" not in ENGINE_SRC and "simulator" not in ENGINE_SRC,
      "the engine detects the drift rather than reading it from the simulator",
      "verification/reconcile.py references neither REPORTING_DRIFT nor the simulator package")

# 2b. dose-response: inject a range of drifts into the *honest* site.
#     If the engine is detecting drift (rather than recognising site-b), the
#     measured divergence must rise with the dose and the verdict must flip.
doses, measured = [0.0, 0.10, 0.25, 0.50], []
for dose in doses:
    tmp = make_dir(drifted(rows, "site-a", dose))
    try:
        use_dir(tmp)
        measured.append(reconcile.reconcile("site-a"))
    finally:
        restore()
        shutil.rmtree(tmp, ignore_errors=True)

divs = [m.divergence_pct for m in measured]
monotonic = all(divs[i + 1] > divs[i] for i in range(len(divs) - 1))
check(monotonic,
      "measured divergence rises monotonically with injected drift",
      "  ".join(f"{d:.0%}->{m:.1f}%" for d, m in zip(doses, divs)))

check(measured[0].status == "verified" and measured[-1].status == "needs_review",
      "the verdict flips from Verified to Needs Review as drift is injected",
      "  ".join(f"{d:.0%}->{m.status}" for d, m in zip(doses, measured)))

# 2c. under-reporting must be caught too -- the seed data only ever over-reports.
tmp = make_dir(drifted(rows, "site-a", -0.40))
try:
    use_dir(tmp)
    under = reconcile.reconcile("site-a")
finally:
    restore()
    shutil.rmtree(tmp, ignore_errors=True)
check(under.status == "needs_review" and under.divergence_pct < 0,
      "an under-reporting site is flagged too, with a negative divergence",
      f"-40% drift -> status={under.status}, divergence {under.divergence_pct}% "
      f"(a one-directional detector would have missed this)")


# === 3. the tolerance threshold is configurable, not hard-coded =============

check("15" not in ENGINE_SRC and "0.15" not in ENGINE_SRC,
      "no tolerance literal appears in the comparison code",
      "verification/reconcile.py contains no '15'/'0.15'; the threshold is only "
      "ever read from the rule object")

loose = replace(RULE, tolerance_pct=50.0)
strict = replace(RULE, tolerance_pct=1.0)
check(reconcile.reconcile("site-b", loose).status == "verified"
      and reconcile.reconcile("site-a", strict).status == "needs_review",
      "changing only the tolerance changes the verdict",
      f"site-b at 50% tolerance -> verified; site-a at 1% tolerance -> needs_review")

patient = replace(RULE, consecutive_breaches_to_flag=999)
check(reconcile.reconcile("site-b", patient).status == "verified",
      "the consecutive-breach requirement is honoured, not just the threshold",
      f"site-b needs 999 consecutive breaches -> verified "
      f"(it only sustains {verdict_b.longest_breach_run})")

check(reconcile.reconcile("site-b", loose).tolerance_pct == 50.0,
      "the response reports the tolerance actually applied",
      "tolerance_pct echoes the rule in force, so a panel cannot show a "
      "verdict from one threshold beside the number of another")


# === 4. the endpoint matches the contract and survives bad input ============

CONTRACT = {"site_id", "status", "divergence_pct", "tolerance_pct", "explanation"}
for sid in store.site_ids():
    r = client.get(f"/api/sites/{sid}/verification")
    body = r.json()
    engine = reconcile.reconcile(sid)
    check(r.status_code == 200 and set(body) == CONTRACT
          and body["status"] in ("verified", "needs_review")
          and body["divergence_pct"] == engine.divergence_pct,
          f"{sid} /verification matches the contract shape exactly",
          f"HTTP {r.status_code}, keys {sorted(body)}, status={body['status']}, "
          f"divergence {body['divergence_pct']}%")

    summary = next(s for s in client.get("/api/sites").json() if s["site_id"] == sid)
    detail = client.get(f"/api/sites/{sid}").json()
    check(summary["status"] == detail["status"] == body["status"],
          f"{sid} reports one status across all three endpoints",
          f"/sites={summary['status']}, /sites/{sid}={detail['status']}, "
          f"/verification={body['status']}")

statuses = {s["status"] for s in client.get("/api/sites").json()}
check(statuses == {"verified", "needs_review"},
      "the Phase 2 'pending' placeholder is gone and both verdicts are live",
      f"statuses across seeded sites: {sorted(statuses)}")

check(client.get("/api/sites/not-a-site/verification").status_code == 404
      and client.get("/api/sites/site-a/verification?range=banana").status_code == 400,
      "bad input answers 404/400, not 500",
      "unknown site -> 404, unparseable range -> 400")


# === 5. edge cases: a site we cannot check is never quietly verified ========

sites_rows = read_rows(DATA / "sites.csv")
template = dict(sites_rows[0])
extra = [dict(template, site_id="site-silent", name="Site Silent -- no readings"),
         dict(template, site_id="site-young", name="Site Young -- 3 days"),
         dict(template, site_id="site-blind", name="Site Blind -- no imagery")]

young = [dict(r, site_id="site-young") for r in rows
         if r["site_id"] == "site-a" and r["timestamp"][:10] <= "2026-08-03"]
blind = [dict(r, site_id="site-blind") for r in rows if r["site_id"] == "site-a"]
imagery_rows = read_rows(DATA / "imagery_index.csv")
extra_imagery = imagery_rows + [dict(r, site_id="site-young")
                                for r in imagery_rows if r["site_id"] == "site-a"]

tmp = make_dir(rows + young + blind, sites_rows + extra, extra_imagery)
try:
    use_dir(tmp)
    silent = reconcile.reconcile("site-silent")
    young_v = reconcile.reconcile("site-young")
    blind_v = reconcile.reconcile("site-blind")
    check(all(v.status == "needs_review" for v in (silent, young_v, blind_v)),
          "a site that cannot be reconciled is flagged, never quietly verified",
          f"no readings -> {silent.status}; 3 days of readings -> {young_v.status}; "
          f"no imagery -> {blind_v.status}")
    check("Cannot reconcile" in silent.explanation
          and "not reported any sensor readings" in silent.explanation
          and "no baseline" in young_v.explanation,
          "the un-checkable cases say why, rather than implying misreporting",
          f"silent: {silent.explanation[:72]}...")

    try:
        reconcile.reconcile("site-does-not-exist")
        typed = False
    except store.UnknownSiteError:
        typed = True
    check(typed, "an unknown site raises the typed error the API maps to 404",
          "store.UnknownSiteError raised, not a pandas KeyError")
finally:
    restore()
    shutil.rmtree(tmp, ignore_errors=True)

# Cloud screening: if every acquisition is too cloudy to use, there is nothing
# to reconcile against, and that must read as unverified rather than agreement.
clouded = [dict(r, cloud_fraction="0.95") if r["site_id"] == "site-a" else dict(r)
           for r in imagery_rows]
tmp = make_dir(rows, None, clouded)
try:
    use_dir(tmp)
    v = reconcile.reconcile("site-a")
    check(v.status == "needs_review" and v.days_compared == 0,
          "imagery too cloudy to use leaves a site unverified, not agreeing",
          f"all site-a acquisitions at 95% cloud (limit "
          f"{RULE.max_cloud_fraction:.0%}) -> {v.status}, {v.days_compared} days compared")
finally:
    restore()
    shutil.rmtree(tmp, ignore_errors=True)

# A gap in the sensor record must not crash or silently shift the comparison.
gapped = [r for r in rows
          if not (r["site_id"] == "site-a" and r["timestamp"][:10] == "2026-08-20")]
tmp = make_dir(gapped)
try:
    use_dir(tmp)
    v = reconcile.reconcile("site-a")
    check(v.status in ("verified", "needs_review") and v.days_compared > 0,
          "a missing day is absorbed by the comparison, not crashed on",
          f"2026-08-20 deleted -> {v.status}, {v.days_compared} days compared "
          f"(was {verdict_a.days_compared})")
finally:
    restore()
    shutil.rmtree(tmp, ignore_errors=True)

# Phase 2 must still be intact -- Phase 3 rewrote the status field it serves.
check(abs(co2.total_co2_kg("site-a") - 142185.39) < 0.01
      and abs(co2.total_co2_kg("site-b") - 32205.31) < 0.01,
      "Phase 2 CO2 figures are unchanged by the Phase 3 wiring",
      f"site-a {co2.total_co2_kg('site-a'):,.2f} kg, "
      f"site-b {co2.total_co2_kg('site-b'):,.2f} kg")


# --- report -----------------------------------------------------------------
print("")
print("PHASE 3 VERIFICATION")
print("=" * 78)
for ok, name, detail in results:
    print(f"  [{'PASS' if ok else 'FAIL'}]  {name}")
    print(f"          {detail}")
failed = [r for r in results if not r[0]]
print("=" * 78)
print(f"  {len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
