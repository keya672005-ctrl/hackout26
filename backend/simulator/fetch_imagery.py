"""Fetch Sentinel-2 L2A scenes and reduce each to one NDCI value per site per date.

Run once, offline, before the demo -- output is cached to data/imagery_index.csv
and the API never calls this at runtime (PRD 5 / 9: no live third-party call
during judging).

NDCI = (B5 - B4) / (B5 + B4), red-edge over red. NDCI rather than NDVI because
we are measuring chlorophyll in water, not canopy greenness on land.

Cloud screening is done on the AOI, not the scene: scene-level `eo:cloud_cover`
describes a 110 km tile and says almost nothing about whether our 600 m pond
block was clear. We read the L2A scene-classification band over the AOI instead
and drop dates where too much of the footprint is cloud, shadow or cirrus.
"""

from __future__ import annotations

import os
import csv
import math
import argparse
from collections import defaultdict
from pathlib import Path

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("AWS_NO_SIGN_REQUEST", "YES")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "4")
os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "2")

import numpy as np
import requests
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds

from simulator.sites import SITES, WINDOW_START, WINDOW_END

STAC_SEARCH = "https://earth-search.aws.element84.com/v1/search"
COLLECTION = "sentinel-2-l2a"

# Sentinel-2 L2A scene classification values that make a pixel unusable.
# 0 no-data, 1 saturated, 2 dark/shadow, 3 cloud shadow,
# 8 cloud medium prob, 9 cloud high prob, 10 thin cirrus, 11 snow.
SCL_BAD = {0, 1, 2, 3, 8, 9, 10, 11}

# Drop a date entirely if more than this fraction of the pond footprint is bad.
MAX_AOI_CLOUD_FRACTION = 0.20

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def aoi_bounds(aoi) -> tuple[float, float, float, float]:
    """Lon/lat bounds of the pond footprint."""
    dlat = (aoi.height_m / 2) / 111_320.0
    dlon = (aoi.width_m / 2) / (111_320.0 * math.cos(math.radians(aoi.lat)))
    return (aoi.lon - dlon, aoi.lat - dlat, aoi.lon + dlon, aoi.lat + dlat)


def search_scenes(lat: float, lon: float, start: str, end: str) -> list[dict]:
    body = {
        "collections": [COLLECTION],
        "intersects": {"type": "Point", "coordinates": [lon, lat]},
        "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z",
        "limit": 100,
    }
    r = requests.post(STAC_SEARCH, json=body, timeout=120)
    r.raise_for_status()
    return r.json().get("features", [])


def read_band(url: str, bounds, out_shape=None) -> np.ndarray:
    """Read a COG windowed to the AOI, optionally resampled to a target grid."""
    with rasterio.open(url) as src:
        b = transform_bounds("EPSG:4326", src.crs, *bounds, densify_pts=21)
        window = from_bounds(*b, transform=src.transform)
        kwargs = dict(window=window, boundless=True, fill_value=0)
        if out_shape is not None:
            kwargs.update(out_shape=out_shape, resampling=Resampling.nearest)
        return src.read(1, **kwargs)


def scene_ndci_grid(feature: dict, bounds):
    """Return the per-pixel NDCI grid over the pond footprint for one scene.

    Returns (ndci_grid, cloud_fraction) with cloud/shadow pixels set to NaN,
    or None when the AOI falls outside this granule's data footprint.
    """
    assets = feature["assets"]

    # B5 (red-edge, 20 m) sets the working grid; B4 and SCL are sampled onto it.
    b5 = read_band(assets["rededge1"]["href"], bounds).astype("float32")
    if b5.size == 0:
        return None
    b4 = read_band(assets["red"]["href"], bounds, out_shape=b5.shape).astype("float32")
    scl = read_band(assets["scl"]["href"], bounds, out_shape=b5.shape)

    bad = np.isin(scl, list(SCL_BAD))
    cloud_fraction = float(bad.mean())

    denom = b5 + b4
    valid = (~bad) & (denom > 0)
    if valid.sum() == 0:
        return None

    ndci = np.full(b5.shape, np.nan, dtype="float32")
    ndci[valid] = (b5[valid] - b4[valid]) / denom[valid]
    return ndci, cloud_fraction


def build_pond_mask(grids: list[np.ndarray], percentile: float) -> np.ndarray:
    """Delineate the pond footprint once, from the whole cleared time series.

    Ponds are permanent, continuously-cropped infrastructure, so they hold a
    high chlorophyll index across every date; berms, service roads and drying
    beds do not. Taking the per-pixel temporal median first and thresholding
    that -- rather than thresholding any single date -- keeps the footprint
    stable, so a later date's value can't move simply because the mask moved.
    """
    stack = np.dstack(grids)
    with np.errstate(invalid="ignore"):
        temporal_median = np.nanmedian(stack, axis=2)
    finite = temporal_median[np.isfinite(temporal_median)]
    if finite.size == 0:
        return np.zeros(temporal_median.shape, dtype=bool)
    cutoff = np.percentile(finite, percentile)
    return np.isfinite(temporal_median) & (temporal_median >= cutoff)


def fetch_site(site, start: str, end: str, percentile: float) -> list[dict]:
    bounds = aoi_bounds(site.aoi)
    scenes = search_scenes(site.aoi.lat, site.aoi.lon, start, end)
    print("")
    print(f"{site.site_id}  {site.operator}")
    print(f"  {len(scenes)} scenes intersect the AOI in {start}..{end}")

    # Pass 1 -- download once, keeping the full grid per usable date.
    # A date can be covered by more than one tile/orbit; keep the clearest.
    by_date: dict[str, dict] = {}
    rejected = defaultdict(int)

    for f in sorted(scenes, key=lambda x: x["properties"]["datetime"]):
        date = f["properties"]["datetime"][:10]
        try:
            result = scene_ndci_grid(f, bounds)
        except Exception as exc:                       # noqa: BLE001
            print(f"  {date}  read failed: {type(exc).__name__}: {exc}")
            rejected["read_error"] += 1
            continue

        if result is None:
            rejected["aoi_outside_granule"] += 1
            continue
        grid, cloud_fraction = result
        if cloud_fraction > MAX_AOI_CLOUD_FRACTION:
            print(f"  {date}  dropped -- AOI {cloud_fraction*100:.0f}% cloud/shadow")
            rejected["cloudy"] += 1
            continue

        prev = by_date.get(date)
        if prev is None or cloud_fraction < prev["cloud_fraction"]:
            by_date[date] = {"date": date, "scene_id": f["id"],
                             "grid": grid, "cloud_fraction": cloud_fraction}

    if not by_date:
        print("  no usable dates")
        return []

    dates = sorted(by_date)

    # Pass 2 -- fix the pond footprint from the whole series, then sample it.
    mask = build_pond_mask([by_date[d]["grid"] for d in dates], percentile)
    pond_px = int(mask.sum())
    pixel_m2 = 20 * 20                                   # B5 native resolution
    print(f"  pond mask: {pond_px} px = {pond_px * pixel_m2 / 10_000:.1f} ha "
          f"(documented cultivation area {site.pond_area_m2 / 10_000:.1f} ha)")

    rows = []
    for d in dates:
        rec = by_date[d]
        vals = rec["grid"][mask]
        vals = vals[np.isfinite(vals)]
        if vals.size == 0:
            rejected["masked_out"] += 1
            continue
        rows.append({
            "site_id": site.site_id,
            "date": d,
            "ndci_value": round(float(np.median(vals)), 4),
            "cloud_fraction": round(rec["cloud_fraction"], 3),
            "valid_pixels": int(vals.size),
            "total_pixels": pond_px,
            "scene_id": rec["scene_id"],
        })

    print(f"  kept {len(rows)} usable dates"
          + (f"  (rejected: {dict(rejected)})" if rejected else ""))
    if rows:
        vals = [r["ndci_value"] for r in rows]
        gaps = [(np.datetime64(rows[i + 1]["date"]) - np.datetime64(rows[i]["date"])).astype(int)
                for i in range(len(rows) - 1)]
        if gaps:
            print(f"  NDCI {min(vals):+.3f} .. {max(vals):+.3f}   "
                  f"revisit gap: median {int(np.median(gaps))}d, max {max(gaps)}d")
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--start", default=WINDOW_START)
    ap.add_argument("--end", default=WINDOW_END)
    ap.add_argument("--out", default=str(DATA_DIR / "imagery_index.csv"))
    ap.add_argument("--mask-percentile", type=float, default=60.0,
                    help="Pixels above this percentile of the temporal-median "
                         "NDCI inside the AOI are treated as pond.")
    args = ap.parse_args()

    all_rows: list[dict] = []
    for site in SITES:
        all_rows.extend(fetch_site(site, args.start, args.end, args.mask_percentile))

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    fields = ["site_id", "date", "ndci_value", "cloud_fraction",
              "valid_pixels", "total_pixels", "scene_id"]
    with out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(all_rows)

    print(f"\nwrote {len(all_rows)} rows -> {out}")


if __name__ == "__main__":
    main()
