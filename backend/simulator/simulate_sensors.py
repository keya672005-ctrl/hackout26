"""Generate the simulated IoT sensor time series for each demo site.

There is no sensor hardware (PRD 5) -- this stands in for it. The series is
built from a logistic growth model modulated by a diurnal light/temperature
cycle with semi-continuous harvesting, so it carries the structure a real pond
record has (day/night oscillation, self-shading saturation, harvest sawtooth)
rather than looking like smoothed random noise.

Growth is tied to the *real* satellite chlorophyll series fetched in
fetch_imagery.py: the measured NDCI modulates productivity, so for an honest
site the sensor record and the satellite proxy genuinely move together and the
Phase 3 reconciliation is comparing two related signals. One site additionally
carries a deliberate reporting drift -- that is the "needs review" case, and it
is injected explicitly here rather than faked downstream so the verification
engine has to actually detect it.

Everything is seeded (PRD 9): the same command yields byte-identical output in
rehearsal and on stage.
"""

from __future__ import annotations

import csv
import math
import argparse
from pathlib import Path
from datetime import datetime, timedelta, timezone

import numpy as np

from simulator.sites import SITES, WINDOW_START, WINDOW_END
from engine.constants import SPECIES, RACEWAY_DEPTH_M, pond_volume_l

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
SEED = 20260912          # fixed: reproducible between rehearsal and demo

#: Sites carrying a deliberate sensor over-reporting drift, as fractional
#: over-statement accumulated across the full window. Detected, not read, by
#: the Phase 3 engine.
REPORTING_DRIFT = {"site-b": 0.34}


def load_ndci(path: Path) -> dict:
    """Read the cached satellite index as {site_id: (day_offsets, ndci)}."""
    start = datetime.fromisoformat(WINDOW_START)
    out: dict = {}
    with path.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            day = (datetime.fromisoformat(row["date"]) - start).days
            out.setdefault(row["site_id"], []).append((day, float(row["ndci_value"])))
    return {k: (np.array([d for d, _ in v], dtype=float),
                np.array([n for _, n in v], dtype=float))
            for k, v in sorted(out.items())}


def diurnal_par(hour_of_day: float, day_of_year: int, lat_deg: float) -> float:
    """Photosynthetically active radiation, umol/m2/s, zero at night.

    Half-sine between sunrise and sunset, with day length from the standard
    solar declination formula so a Hawaii site and a California site get
    different photoperiods.
    """
    decl = 23.44 * math.sin(math.radians(360 / 365 * (day_of_year - 81)))
    lat, d = math.radians(lat_deg), math.radians(decl)
    cos_h = -math.tan(lat) * math.tan(d)
    cos_h = max(-1.0, min(1.0, cos_h))
    half_day = math.degrees(math.acos(cos_h)) / 15.0        # hours from noon
    if abs(hour_of_day - 12.0) >= half_day:
        return 0.0
    return 2000.0 * math.cos(math.pi * (hour_of_day - 12.0) / (2 * half_day))


def light_limitation(par: float, half_sat: float = 250.0) -> float:
    """Monod light response with mild photoinhibition above saturation."""
    if par <= 0:
        return 0.0
    resp = par / (half_sat + par)
    if par > 1600:
        resp *= 1.0 - 0.18 * (par - 1600) / 400.0
    return max(0.0, resp)


def temp_limitation(temp_c: float, opt_c: float, width: float = 11.0) -> float:
    """Gaussian thermal response around the species optimum."""
    return math.exp(-((temp_c - opt_c) ** 2) / (2 * width ** 2))


def simulate_site(site, ndci_days, ndci_vals, rng) -> list:
    params = SPECIES[site.species]
    volume_l = pond_volume_l(site.pond_area_m2, RACEWAY_DEPTH_M)

    start = datetime.fromisoformat(WINDOW_START).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(WINDOW_END).replace(tzinfo=timezone.utc)
    hours = int((end - start).total_seconds() // 3600) + 24

    # The satellite series is sparse (one point every ~5 days); interpolate it
    # onto the hourly grid to drive productivity. Normalised about its own mean,
    # so it modulates growth rather than setting its scale.
    grid_days = np.arange(hours) / 24.0
    ndci_i = np.interp(grid_days, ndci_days, ndci_vals)
    productivity = 1.0 + 0.55 * (ndci_i / ndci_vals.mean() - 1.0)

    drift_total = REPORTING_DRIFT.get(site.site_id, 0.0)

    x = params["k_carrying"] * 0.42           # starting density, g/L
    rows = []

    for h in range(hours):
        ts = start + timedelta(hours=h)
        hod = ts.hour + ts.minute / 60.0
        doy = ts.timetuple().tm_yday

        par = diurnal_par(hod, doy, site.aoi.lat)
        # Water temperature: diurnal swing lagging peak sun by ~2 h.
        base_t = params["opt_temp_C"] - 4.0
        temp = base_t + 5.5 * math.sin(2 * math.pi * (hod - 9.0) / 24.0) \
               + rng.normal(0, 0.25)

        mu = (params["mu_max"]
              * light_limitation(par)
              * temp_limitation(temp, params["opt_temp_C"])
              * max(0.0, 1.0 - x / params["k_carrying"])
              * productivity[h])

        growth = x * mu / 24.0                                    # per hour
        growth *= max(0.0, 1.0 + rng.normal(0, 0.05))             # process noise
        x += growth
        produced_kg = growth * volume_l / 1000.0                  # g/L -> kg

        # Semi-continuous harvest: draw down once the culture hits the trigger.
        harvested = 0.0
        if x >= params["harvest_trigger"] and 9 <= hod <= 11:
            harvested = x * params["harvest_fraction"]
            x -= harvested

        # Derived water-chemistry channels. Photosynthesis strips CO2 and
        # releases O2 during daylight, which drives pH up; all reverse at night.
        photo = light_limitation(par)
        do_mg = 6.8 + 5.2 * photo + rng.normal(0, 0.18)
        co2_mg = 22.0 - 11.0 * photo + rng.normal(0, 0.5)
        ph = params["opt_pH"] - 0.45 + 0.65 * photo + rng.normal(0, 0.03)
        turbidity = 18.0 + 46.0 * (x / params["k_carrying"]) + rng.normal(0, 1.4)

        # Reported density carries the drift for a mis-reporting site: it ramps
        # in linearly so early dates agree and the divergence only emerges later.
        ramp = 1.0 + drift_total * (h / hours)

        rows.append({
            "site_id": site.site_id,
            "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "biomass_density_g_L": round(x * ramp, 4),
            "biomass_produced_kg": round(produced_kg * ramp, 4),
            "water_temp_C": round(temp, 2),
            "pH": round(ph, 2),
            "dissolved_O2_mg_L": round(max(0.0, do_mg), 2),
            "dissolved_CO2_mg_L": round(max(0.0, co2_mg), 2),
            "turbidity_NTU": round(max(0.0, turbidity), 1),
            "light_PAR": round(par, 1),
            "harvested_g_L": round(harvested, 4),
        })

    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--imagery", default=str(DATA_DIR / "imagery_index.csv"))
    ap.add_argument("--out", default=str(DATA_DIR / "sensor_readings.csv"))
    ap.add_argument("--sites-out", default=str(DATA_DIR / "sites.csv"))
    args = ap.parse_args()

    ndci = load_ndci(Path(args.imagery))
    rng = np.random.default_rng(SEED)

    all_rows = []
    for site in SITES:
        if site.site_id not in ndci:
            print(f"{site.site_id}: no imagery -- skipped")
            continue
        days, vals = ndci[site.site_id]
        rows = simulate_site(site, days, vals, rng)
        all_rows.extend(rows)
        dens = [r["biomass_density_g_L"] for r in rows]
        harvests = sum(1 for r in rows if r["harvested_g_L"] > 0)
        drift = REPORTING_DRIFT.get(site.site_id, 0.0)
        print(f"{site.site_id}  {len(rows):5d} hourly readings  "
              f"density {min(dens):.3f}-{max(dens):.3f} g/L  "
              f"{harvests} harvests  drift={drift:.0%}")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(all_rows[0].keys()))
        w.writeheader()
        w.writerows(all_rows)
    print(f"wrote {len(all_rows)} rows -> {out}")

    sites_out = Path(args.sites_out)
    site_rows = [s.as_row() for s in SITES if s.site_id in ndci]
    with sites_out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(site_rows[0].keys()))
        w.writeheader()
        w.writerows(site_rows)
    print(f"wrote {len(site_rows)} rows -> {sites_out}")


if __name__ == "__main__":
    main()
