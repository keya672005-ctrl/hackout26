"""Phase 1 verification gate (PRD 11).

Checks each box on the Phase 1 checklist against the actual seeded data and
exits non-zero if any of them fails, so the gate cannot be passed by assertion.
"""

from __future__ import annotations

import csv
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import numpy as np

DATA = Path(__file__).resolve().parent / "data"
results: list[tuple[bool, str, str]] = []


def check(ok: bool, name: str, detail: str) -> None:
    results.append((ok, name, detail))


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


# --- 1. believable growth curve, not random noise --------------------------
readings = read_csv(DATA / "sensor_readings.csv")
by_site: dict[str, list[dict]] = defaultdict(list)
for r in readings:
    by_site[r["site_id"]].append(r)

for sid, rows in sorted(by_site.items()):
    dens = np.array([float(r["biomass_density_g_L"]) for r in rows])
    par = np.array([float(r["light_PAR"]) for r in rows])
    do = np.array([float(r["dissolved_O2_mg_L"]) for r in rows])
    produced = np.array([float(r["biomass_produced_kg"]) for r in rows])
    harvests = np.array([float(r["harvested_g_L"]) for r in rows])

    # Structure test: run it on hourly production, not on the density
    # increments. Density increments also contain the semi-continuous harvest
    # draw-downs, which are ~45x a typical hourly gain; those few outliers
    # dominate a Pearson estimate and drive it to ~0 even though the underlying
    # growth is highly structured. Production isolates the growth process.
    r1 = float(np.corrcoef(produced[:-1], produced[1:])[0, 1])

    # ...and confirm it beats a shuffled copy of itself, which is the actual
    # "is this just noise?" question.
    shuffled = np.random.default_rng(0).permutation(produced)
    r1_shuffled = float(np.corrcoef(shuffled[:-1], shuffled[1:])[0, 1])

    # Diurnal test: dissolved oxygen must track light within the day.
    diurnal_r = float(np.corrcoef(par, do)[0, 1])

    # Range test: density must stay in a physically sensible band.
    in_range = bool(0.05 < dens.min() and dens.max() < 3.0)

    check(r1 > 0.60 and r1 > r1_shuffled + 0.5,
          f"{sid} growth is structured, not noise",
          f"lag-1 autocorrelation of hourly production r1={r1:+.3f} "
          f"vs shuffled {r1_shuffled:+.3f}")
    check(diurnal_r > 0.80, f"{sid} diurnal cycle present",
          f"corr(light_PAR, dissolved_O2)={diurnal_r:+.3f}")
    check(in_range, f"{sid} density physically plausible",
          f"{dens.min():.3f}-{dens.max():.3f} g/L")
    check((harvests > 0).sum() >= 2, f"{sid} harvest sawtooth present",
          f"{int((harvests > 0).sum())} semi-continuous harvest events")

# --- 2. imagery_index: one value per site per date, no gaps -----------------
imagery = read_csv(DATA / "imagery_index.csv")
img_by_site: dict[str, list[str]] = defaultdict(list)
for r in imagery:
    img_by_site[r["site_id"]].append(r["date"])

for sid, dates in sorted(img_by_site.items()):
    dup = len(dates) != len(set(dates))
    ds = sorted(datetime.fromisoformat(d) for d in set(dates))
    gaps = [(ds[i + 1] - ds[i]).days for i in range(len(ds) - 1)]
    worst = max(gaps) if gaps else 0
    # Sentinel-2 revisit is ~5 days; allow up to 16 for cloud-lost acquisitions.
    check(not dup, f"{sid} imagery has one value per date",
          f"{len(dates)} rows, {len(set(dates))} distinct dates")
    check(worst <= 16, f"{sid} no unacceptable gap in demo window",
          f"{len(ds)} acquisitions, median gap {int(np.median(gaps))}d, max {worst}d")

# --- 3. CO2 conversion hand-check ------------------------------------------
sys.path.insert(0, str(Path(__file__).resolve().parent))
from engine.constants import CO2_PER_KG_BIOMASS, biomass_to_co2_kg  # noqa: E402

got = biomass_to_co2_kg(1000.0)
check(1750.0 <= got <= 1900.0, "CO2 conversion matches the ~1.8x hand-check",
      f"1000 kg dry biomass -> {got:.1f} kg CO2 (factor {CO2_PER_KG_BIOMASS:.4f})")

# --- 4. data loads into the database without schema errors ------------------
db_path = DATA / "algae.db"
if db_path.exists():
    db_path.unlink()
con = sqlite3.connect(db_path)
con.executescript("""
CREATE TABLE sites (
    site_id TEXT PRIMARY KEY, name TEXT, operator TEXT, species TEXT,
    pond_type TEXT, pond_area_m2 INTEGER, facility_acres INTEGER,
    commissioning_date TEXT, location TEXT, aoi_lat REAL, aoi_lon REAL);
CREATE TABLE sensor_readings (
    site_id TEXT NOT NULL REFERENCES sites(site_id), timestamp TEXT NOT NULL,
    biomass_density_g_L REAL, biomass_produced_kg REAL, water_temp_C REAL,
    pH REAL, dissolved_O2_mg_L REAL, dissolved_CO2_mg_L REAL,
    turbidity_NTU REAL, light_PAR REAL, harvested_g_L REAL,
    PRIMARY KEY (site_id, timestamp));
CREATE TABLE imagery_index (
    site_id TEXT NOT NULL REFERENCES sites(site_id), date TEXT NOT NULL,
    ndci_value REAL NOT NULL, cloud_fraction REAL, valid_pixels INTEGER,
    total_pixels INTEGER, scene_id TEXT, PRIMARY KEY (site_id, date));
CREATE TABLE verification_rules (
    rule_id TEXT PRIMARY KEY, description TEXT, tolerance_pct REAL,
    rolling_window_days INTEGER, consecutive_breaches_to_flag INTEGER);
""")

try:
    for table, path in (("sites", "sites.csv"),
                        ("sensor_readings", "sensor_readings.csv"),
                        ("imagery_index", "imagery_index.csv")):
        rows = read_csv(DATA / path)
        cols = list(rows[0].keys())
        con.executemany(
            f"INSERT INTO {table} ({','.join(cols)}) "
            f"VALUES ({','.join('?' * len(cols))})",
            [tuple(r[c] for c in cols) for r in rows])

    from verification.rules import RULES  # noqa: E402
    con.executemany(
        "INSERT INTO verification_rules VALUES (?,?,?,?,?)",
        [(r.rule_id, r.description, r.tolerance_pct, r.rolling_window_days,
          r.consecutive_breaches_to_flag) for r in RULES])
    con.commit()

    counts = {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
              for t in ("sites", "sensor_readings", "imagery_index",
                        "verification_rules")}
    orphans = con.execute(
        "SELECT COUNT(*) FROM sensor_readings r "
        "LEFT JOIN sites s USING(site_id) WHERE s.site_id IS NULL").fetchone()[0]
    check(orphans == 0 and all(v > 0 for v in counts.values()),
          "seed data loads into the database cleanly",
          f"{counts}, foreign-key orphans={orphans}")
except sqlite3.Error as exc:
    check(False, "seed data loads into the database cleanly", f"sqlite error: {exc}")
finally:
    con.close()

# --- report -----------------------------------------------------------------
print("")
print("PHASE 1 VERIFICATION")
print("=" * 78)
for ok, name, detail in results:
    print(f"  [{'PASS' if ok else 'FAIL'}]  {name}")
    print(f"          {detail}")
failed = [r for r in results if not r[0]]
print("=" * 78)
print(f"  {len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
