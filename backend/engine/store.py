"""Read-only access to the Phase 1 seed data.

The CSVs in `data/` are the source of truth (PRD 11, Phase 1 deliverable) --
`algae.db` is rebuilt from them by the verification gate, so reading the CSVs
avoids depending on a file that gets deleted and recreated. Everything is small
(2,016 hourly readings, 15 imagery rows) so each file is parsed once at first
use and cached in memory; nothing here touches the network, which is the PRD 12
rule about never calling the imagery API at runtime.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


class UnknownSiteError(KeyError):
    """Raised when a site_id is not in the seed data."""


@lru_cache(maxsize=1)
def sites() -> pd.DataFrame:
    """Site metadata, indexed by site_id, in seed order."""
    df = pd.read_csv(DATA_DIR / "sites.csv")
    return df.set_index("site_id", drop=False)


@lru_cache(maxsize=1)
def _all_readings() -> pd.DataFrame:
    df = pd.read_csv(DATA_DIR / "sensor_readings.csv", parse_dates=["timestamp"])
    return df.sort_values(["site_id", "timestamp"], kind="stable")


@lru_cache(maxsize=1)
def _all_imagery() -> pd.DataFrame:
    df = pd.read_csv(DATA_DIR / "imagery_index.csv", parse_dates=["date"])
    return df.sort_values(["site_id", "date"], kind="stable")


def site_ids() -> list[str]:
    return list(sites()["site_id"])


def site(site_id: str) -> pd.Series:
    """One site's metadata row. Raises UnknownSiteError for an unknown id."""
    try:
        return sites().loc[site_id]
    except KeyError as exc:
        raise UnknownSiteError(site_id) from exc


def readings(site_id: str) -> pd.DataFrame:
    """Hourly sensor readings for one site, oldest first.

    A known site with no readings yields an empty frame rather than an error --
    a newly commissioned pond is a real state, not a failure (PRD 11 Phase 2,
    "edge cases don't crash the calculation").
    """
    site(site_id)                       # validates the id
    return _all_readings()[_all_readings()["site_id"] == site_id].copy()


def imagery(site_id: str) -> pd.DataFrame:
    """Cached Sentinel-2 NDCI series for one site, oldest first."""
    site(site_id)
    return _all_imagery()[_all_imagery()["site_id"] == site_id].copy()
