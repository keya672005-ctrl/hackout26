"""Phase 2 verification gate (PRD 11).

Checks each box on the Phase 2 checklist against the real engine and the real
API, and exits non-zero if any of them fails, so the gate cannot be passed by
assertion.

The hand-check is deliberately *independent*: it re-derives the numbers from
the raw CSV with the standard-library csv module and a literal 0.50 * 44.01 /
12.011, never importing the engine's aggregation. If both paths agree, the
agreement means something.
"""

from __future__ import annotations

import csv
import shutil
import sys
import tempfile
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))
DATA = BASE / "data"

from fastapi.testclient import TestClient            # noqa: E402

import app                                           # noqa: E402
from engine import co2, store                        # noqa: E402
from engine.constants import CO2_PER_KG_BIOMASS      # noqa: E402

results: list[tuple[bool, str, str]] = []
client = TestClient(app.app)

#: The conversion, written out longhand rather than imported -- an independent
#: restatement of engine/constants.py, so a typo there fails this gate.
HAND_FACTOR = 0.50 * 44.01 / 12.011


def check(ok: bool, name: str, detail: str) -> None:
    results.append((bool(ok), name, detail))


def raw_daily(site_id: str) -> dict:
    """Sum hourly biomass_produced_kg per calendar day, straight from the CSV."""
    out: dict = defaultdict(float)
    with (DATA / "sensor_readings.csv").open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row["site_id"] == site_id:
                out[row["timestamp"][:10]] += float(row["biomass_produced_kg"])
    return dict(out)


# --- 1. unit test: hand-calculated input/output pair ------------------------
# 1a. The single conversion, on a round number anyone can redo on a calculator.
got = co2.hand_check(1000.0)
check(abs(got - 1832.1) < 0.5,
      "CO2 conversion matches the hand-calculated pair",
      f"1000 kg dry biomass -> {got:.2f} kg CO2 "
      f"(hand: 1000 x 0.50 x 44.01/12.011 = {1000 * HAND_FACTOR:.2f})")

# 1b. The whole pipeline for one named day, re-derived from the raw CSV.
probe_site, probe_day = "site-a", "2026-08-15"
raw = raw_daily(probe_site)
expected_day_co2 = raw[probe_day] * HAND_FACTOR
point = next(p for p in co2.daily_series(probe_site) if p.date == probe_day)
check(abs(point.co2_fixed_kg - expected_day_co2) <= 0.02,
      f"engine reproduces a hand-summed day ({probe_site} {probe_day})",
      f"CSV sum {raw[probe_day]:.2f} kg biomass x {HAND_FACTOR:.4f} = "
      f"{expected_day_co2:.2f} kg CO2; engine says {point.co2_fixed_kg:.2f}")

# 1c. ...and the cumulative figure over the whole window.
expected_total = sum(raw.values()) * HAND_FACTOR
engine_total = co2.total_co2_kg(probe_site)
check(abs(engine_total - expected_total) <= 0.5 and CO2_PER_KG_BIOMASS > 0,
      f"cumulative CO2 matches an independent CSV sum ({probe_site})",
      f"hand {expected_total:,.1f} kg vs engine {engine_total:,.1f} kg "
      f"(delta {abs(engine_total - expected_total):.3f} kg)")


# --- 2. endpoint returns correct values for all seeded demo sites -----------
CONTRACT = {                                    # architecture.md 3, exactly
    "summary": {"site_id", "name", "species", "co2_sequestered_kg", "status", "trend"},
    "detail": {"site_id", "name", "species", "pond_type", "pond_area_m2",
               "commissioning_date", "status"},
    "reading": {"date", "biomass_density_g_L", "co2_uptake_cum_kg", "water_temp_C",
                "pH", "dissolved_O2_mg_L", "dissolved_CO2_mg_L", "turbidity_NTU"},
    "imagery": {"date", "ndci_value"},
}

seeded = store.site_ids()
r = client.get("/api/sites")
overview = r.json()
check(r.status_code == 200 and [s["site_id"] for s in overview] == seeded,
      "GET /api/sites lists every seeded site",
      f"HTTP {r.status_code}, returned {[s['site_id'] for s in overview]}, "
      f"seeded {seeded}")
check(all(set(s) == CONTRACT["summary"] for s in overview),
      "GET /api/sites matches the contract shape exactly",
      f"keys {sorted(set().union(*(set(s) for s in overview)))}")

for sid in seeded:
    hand = sum(raw_daily(sid).values()) * HAND_FACTOR
    api_total = next(s for s in overview if s["site_id"] == sid)["co2_sequestered_kg"]
    check(abs(api_total - hand) <= 0.5,
          f"{sid} headline CO2 is the hand-calculated figure",
          f"API {api_total:,.1f} kg vs hand {hand:,.1f} kg")

    d = client.get(f"/api/sites/{sid}")
    meta = store.site(sid)
    check(d.status_code == 200 and set(d.json()) == CONTRACT["detail"]
          and d.json()["pond_area_m2"] == int(meta.pond_area_m2),
          f"{sid} detail endpoint matches the contract",
          f"HTTP {d.status_code}, pond_area_m2={d.json().get('pond_area_m2')}")

    rd = client.get(f"/api/sites/{sid}/readings?range=6w").json()["series"]
    days = [date.fromisoformat(p["date"]) for p in rd]
    contiguous = all(days[i + 1] - days[i] == timedelta(days=1)
                     for i in range(len(days) - 1))
    cum = [p["co2_uptake_cum_kg"] for p in rd]
    monotonic = all(cum[i + 1] >= cum[i] for i in range(len(cum) - 1))
    check(len(rd) == 42 and contiguous and set(rd[0]) == CONTRACT["reading"],
          f"{sid} readings series covers the 6-week window, contract shape",
          f"{len(rd)} daily points {rd[0]['date']}..{rd[-1]['date']}, "
          f"contiguous={contiguous}")
    check(monotonic and abs(cum[-1] - api_total) < 0.01,
          f"{sid} cumulative CO2 is monotonic and ends at the headline figure",
          f"{cum[0]:,.1f} -> {cum[-1]:,.1f} kg, headline {api_total:,.1f} kg")

    # Plausibility: areal productivity a pond scientist would recognise.
    # Commercial open raceways run ~10-25 g dry weight/m2/day; slower species
    # sit at the bottom of that band. Anything outside 1-40 means the volume
    # or the conversion is wrong by an order of magnitude.
    biomass_kg = hand / HAND_FACTOR
    g_m2_day = biomass_kg * 1000 / int(meta.pond_area_m2) / len(rd)
    check(1.0 <= g_m2_day <= 40.0,
          f"{sid} areal productivity is physically plausible",
          f"{g_m2_day:.1f} g dry weight/m2/day over {len(rd)} days "
          f"({int(meta.pond_area_m2):,} m2)")

    im = client.get(f"/api/sites/{sid}/imagery-index?range=6w").json()["series"]
    with (DATA / "imagery_index.csv").open(encoding="utf-8") as fh:
        csv_rows = sum(1 for row in csv.DictReader(fh) if row["site_id"] == sid)
    check(len(im) == csv_rows and set(im[0]) == CONTRACT["imagery"],
          f"{sid} imagery endpoint serves the full cached series",
          f"{len(im)} points from {csv_rows} cached rows, "
          f"{im[0]['date']}..{im[-1]['date']}")

check(client.get("/api/sites/not-a-site").status_code == 404
      and client.get("/api/sites/site-a/readings?range=banana").status_code == 400,
      "bad input answers 404/400, not 500",
      "unknown site -> 404, unparseable range -> 400")


# --- 3. edge cases don't crash the calculation ------------------------------
# Run the engine against a deliberately damaged copy of the seed data: a day
# deleted outright, a day with 18 of its 24 hours missing, a site that has
# reported for exactly one day, and a site that has never reported at all.
tmp = Path(tempfile.mkdtemp(prefix="phase2-edge-"))
try:
    shutil.copy(DATA / "imagery_index.csv", tmp / "imagery_index.csv")

    with (DATA / "sites.csv").open(encoding="utf-8") as fh:
        site_rows = list(csv.DictReader(fh))
    template = dict(site_rows[0])
    new_day = dict(template, site_id="site-new", name="Site New -- day one")
    silent = dict(template, site_id="site-silent", name="Site Silent -- no readings")
    with (tmp / "sites.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(template))
        w.writeheader()
        w.writerows(site_rows + [new_day, silent])

    with (DATA / "sensor_readings.csv").open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    DROPPED, PARTIAL = "2026-08-20", "2026-08-25"
    damaged = []
    for row in rows:
        if row["site_id"] == "site-a":
            day, hour = row["timestamp"][:10], int(row["timestamp"][11:13])
            if day == DROPPED:                       # whole day lost
                continue
            # Logger recorded only 06:00-11:59. Keeping daylight hours matters:
            # a night-only fragment would legitimately sum to 0 kg and prove
            # nothing about whether partial days are counted.
            if day == PARTIAL and not (6 <= hour < 12):
                continue
        damaged.append(row)
        if row["site_id"] == "site-a" and row["timestamp"][:10] == "2026-08-01":
            damaged.append(dict(row, site_id="site-new"))   # first day of cycle
    with (tmp / "sensor_readings.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(damaged)

    real_dir = store.DATA_DIR
    store.DATA_DIR = tmp
    for fn in (store.sites, store._all_readings, store._all_imagery):
        fn.cache_clear()

    series = co2.daily_series("site-a")
    dates = [p.date for p in series]
    cum = [p.co2_uptake_cum_kg for p in series]
    partial = next(p for p in series if p.date == PARTIAL)
    check(DROPPED not in dates and len(series) == 41
          and all(cum[i + 1] >= cum[i] for i in range(len(cum) - 1)),
          "a missing day is skipped, not crashed or back-filled",
          f"{len(series)} days, {DROPPED} absent, cumulative still monotonic")
    check(abs(partial.coverage - 0.25) < 1e-6 and partial.co2_fixed_kg > 0,
          "a partial day is counted as reported and flagged, not extrapolated",
          f"{PARTIAL}: coverage {partial.coverage:.2f} (6/24 h), "
          f"{partial.co2_fixed_kg:.1f} kg CO2 from the hours that exist")

    first = co2.daily_series("site-new")
    check(len(first) == 1
          and abs(first[0].co2_uptake_cum_kg - first[0].co2_fixed_kg) < 0.01
          and co2.co2_trend("site-new") == [first[0].co2_uptake_cum_kg],
          "first day of a cycle computes without a prior day to lean on",
          f"1 day, cumulative == that day's {first[0].co2_fixed_kg:.1f} kg, "
          f"trend returns 1 point instead of padding")

    silent_total = co2.total_co2_kg("site-silent")
    check(co2.daily_series("site-silent") == [] and silent_total == 0.0
          and co2.co2_trend("site-silent") == []
          and co2.imagery_series("site-silent") == [],
          "a site that has never reported returns zero, not an exception",
          f"empty series, total {silent_total} kg, empty trend")

    try:
        co2.daily_series("site-does-not-exist")
        unknown_ok = False
    except store.UnknownSiteError:
        unknown_ok = True
    check(unknown_ok, "an unknown site raises a typed error the API maps to 404",
          "store.UnknownSiteError raised, not KeyError/IndexError from pandas")
finally:
    store.DATA_DIR = real_dir
    for fn in (store.sites, store._all_readings, store._all_imagery):
        fn.cache_clear()
    shutil.rmtree(tmp, ignore_errors=True)


# --- report -----------------------------------------------------------------
print("")
print("PHASE 2 VERIFICATION")
print("=" * 78)
for ok, name, detail in results:
    print(f"  [{'PASS' if ok else 'FAIL'}]  {name}")
    print(f"          {detail}")
failed = [r for r in results if not r[0]]
print("=" * 78)
print(f"  {len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
