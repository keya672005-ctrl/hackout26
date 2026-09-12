"""Phase 2 calculation layer: sensor readings -> CO2 sequestered.

The chain is deliberately short and hand-checkable, because the whole pitch is
that a verifier can audit the number:

    hourly biomass produced (kg)  ->  daily total (kg)
                                  ->  x 1.8321 kg CO2 / kg dry biomass
                                  ->  cumulative CO2 over the reporting window

Two modelling choices worth defending out loud:

* **Gross production, not standing crop.** Carbon is fixed the moment biomass
  is grown. Harvesting removes biomass from the pond but does not un-fix that
  carbon, so cumulative CO2 follows cumulative *production*, not the density
  curve -- which sawtooths downward at every harvest.
* **"Fixed", reported as sequestered.** What the sensors support is biological
  CO2 fixation over the reporting window. How much of it stays out of the
  atmosphere depends on what the harvested biomass becomes, which is outside
  this platform's scope (PRD 5). The report wording keeps that honest rather
  than the maths inflating it.

Nothing here trusts a reading it was not given: missing hours reduce the day's
total instead of being back-filled, and each day carries a coverage figure so a
partial day is visible to the verification layer rather than silently averaged
away.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, asdict

import numpy as np
import pandas as pd

from engine import store
from engine.constants import CO2_PER_KG_BIOMASS, biomass_to_co2_kg

#: A complete day of the simulated logger is 24 hourly rows.
READINGS_PER_DAY = 24

_RANGE_RE = re.compile(r"^(\d+)\s*([dw])$", re.IGNORECASE)


@dataclass(frozen=True)
class DailyPoint:
    """One calendar day of a site's record, aggregated from hourly readings."""

    date: str
    biomass_density_g_L: float
    biomass_produced_kg: float
    co2_fixed_kg: float
    co2_uptake_cum_kg: float
    water_temp_C: float
    pH: float
    dissolved_O2_mg_L: float
    dissolved_CO2_mg_L: float
    turbidity_NTU: float
    #: Fraction of the day's expected hourly readings actually present (0-1).
    #: Below 1.0 the day's production is an undercount, not an error.
    coverage: float

    def as_dict(self) -> dict:
        return asdict(self)


def parse_range(text: str | None) -> int | None:
    """Turn a `?range=` value into a day count. `None`/"all" means no limit.

    Accepts the compact forms the dashboard uses -- "6w", "14d". Anything else
    is a caller error and raises ValueError, so a typo shows up as a 400 rather
    than silently returning the whole series.
    """
    if text is None or text.strip().lower() == "all":
        return None
    m = _RANGE_RE.match(text.strip())
    if not m:
        raise ValueError(
            f"unrecognised range {text!r} -- expected e.g. '6w', '30d' or 'all'")
    n, unit = int(m.group(1)), m.group(2).lower()
    if n <= 0:
        raise ValueError(f"range {text!r} must be a positive number of days/weeks")
    return n * (7 if unit == "w" else 1)


def daily_series(site_id: str, range_days: int | None = None) -> list[DailyPoint]:
    """Daily CO2 series for one site, oldest first.

    `range_days` trims to the most recent N days *of available data* -- anchored
    on the last reading, not on today's date, so the demo window stays stable
    whenever the demo is run.

    Cumulative CO2 always accumulates from the start of the returned range, so
    the first point of a trimmed series is that range's own opening balance
    rather than a number the chart has no earlier context for.
    """
    df = store.readings(site_id)
    if df.empty:
        return []

    df = df.assign(day=df["timestamp"].dt.date)

    grouped = df.groupby("day", sort=True)
    daily = grouped.agg(
        biomass_density_g_L=("biomass_density_g_L", "mean"),
        biomass_produced_kg=("biomass_produced_kg", "sum"),
        water_temp_C=("water_temp_C", "mean"),
        pH=("pH", "mean"),
        dissolved_O2_mg_L=("dissolved_O2_mg_L", "mean"),
        dissolved_CO2_mg_L=("dissolved_CO2_mg_L", "mean"),
        turbidity_NTU=("turbidity_NTU", "mean"),
        n_readings=("timestamp", "size"),
    )

    if range_days is not None:
        daily = daily.tail(range_days)
    if daily.empty:
        return []

    co2 = daily["biomass_produced_kg"] * CO2_PER_KG_BIOMASS
    cum = co2.cumsum()

    return [
        DailyPoint(
            date=str(day),
            biomass_density_g_L=round(float(row.biomass_density_g_L), 4),
            biomass_produced_kg=round(float(row.biomass_produced_kg), 2),
            co2_fixed_kg=round(float(co2.loc[day]), 2),
            co2_uptake_cum_kg=round(float(cum.loc[day]), 2),
            water_temp_C=round(float(row.water_temp_C), 2),
            pH=round(float(row.pH), 2),
            dissolved_O2_mg_L=round(float(row.dissolved_O2_mg_L), 2),
            dissolved_CO2_mg_L=round(float(row.dissolved_CO2_mg_L), 2),
            turbidity_NTU=round(float(row.turbidity_NTU), 1),
            coverage=round(min(1.0, int(row.n_readings) / READINGS_PER_DAY), 3),
        )
        for day, row in zip(daily.index, daily.itertuples())
    ]


def total_co2_kg(site_id: str, range_days: int | None = None) -> float:
    """Total CO2 fixed over the range -- the headline figure for a site.

    Zero for a site with no readings yet, which is the correct answer for a
    pond that has not reported, not a crash.
    """
    series = daily_series(site_id, range_days)
    return series[-1].co2_uptake_cum_kg if series else 0.0


def co2_trend(site_id: str, points: int = 6,
              range_days: int | None = None) -> list[float]:
    """Sparkline points: cumulative CO2 sampled at `points` evenly spaced days.

    Always includes the first and last day so the sparkline spans the same
    period as the headline total. A series shorter than `points` is returned
    whole rather than padded.
    """
    series = daily_series(site_id, range_days)
    if not series:
        return []
    if len(series) <= points:
        return [p.co2_uptake_cum_kg for p in series]
    idx = np.linspace(0, len(series) - 1, points).round().astype(int)
    return [series[i].co2_uptake_cum_kg for i in idx]


def imagery_series(site_id: str, range_days: int | None = None) -> list[dict]:
    """Cached satellite NDCI points for one site (the dashed chart line).

    Trimmed against the sensor record's last day, not the last *imagery* day,
    so both chart lines cover the same period even though acquisitions are
    sparse and the final one may predate the last reading.
    """
    img = store.imagery(site_id)
    if img.empty:
        return []
    if range_days is not None:
        readings = store.readings(site_id)
        anchor = (readings["timestamp"].max().normalize().tz_localize(None)
                  if not readings.empty else img["date"].max())
        img = img[img["date"] > anchor - pd.Timedelta(days=range_days)]
    return [
        {"date": row.date.date().isoformat(), "ndci_value": round(float(row.ndci_value), 4)}
        for row in img.itertuples()
    ]


def hand_check(kg_dry_biomass: float) -> float:
    """Exposed for the Phase 2 gate: the one conversion, on one number."""
    return biomass_to_co2_kg(kg_dry_biomass)
