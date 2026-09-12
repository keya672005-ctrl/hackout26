"""Demo site definitions.

Six raceway blocks across two real, operating commercial algae facilities --
Earthrise Nutritionals (Calipatria, CA) and Cyanotech (Keahole Point, HI).

The blocks are not an arbitrary carve-up of the property. Each `aoi` was
delineated from the imagery itself: the per-pixel temporal median NDCI over the
facility footprint was thresholded and connected-component labelled, so a block
is a contiguous run of pixels that holds chlorophyll across *every* date in the
window. That is what separates a cultivation pond from the berms, service roads
and drying beds between them, and the resulting rectangles line up with the
raceway channels visible in the scene.

Every block sits inside the facility footprint Phase 1 hand-delineated and
validated. That containment is load-bearing: clustering over the wider property
also finds the Imperial Valley cropland south of Earthrise and the coastal
strip west of Cyanotech, both of which are chlorophyll-rich and neither of which
is a pond. NDCI cannot tell a raceway from an alfalfa field -- staying inside a
footprint that was already checked is what keeps that distinction.

The footprint is fixed once and reused for every date, which is what makes the
time series comparable.

`pond_area_m2` is the measured block footprint, not the full facility acreage
(which includes buildings, drying beds and roads) -- the CO2 maths in Phase 2
needs cultivation area, not property area. The six blocks sum to roughly the
20 ha of pond the single-AOI Phase 1 pass measured across both facilities,
which is the cross-check that the subdivision did not invent area.
"""

from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class AOI:
    """Axis-aligned pond footprint, as a centre point plus extent in metres."""
    lat: float
    lon: float
    width_m: float
    height_m: float


@dataclass(frozen=True)
class Site:
    site_id: str
    name: str
    operator: str
    species: str
    pond_type: str
    pond_area_m2: int
    facility_acres: int
    commissioning_date: str
    location: str
    aoi: AOI

    def as_row(self) -> dict:
        d = asdict(self)
        d.pop("aoi")
        d["aoi_lat"] = self.aoi.lat
        d["aoi_lon"] = self.aoi.lon
        return d


SITES = [
    # --- Earthrise Nutritionals, Calipatria CA -- three of its raceway blocks
    Site(
        site_id="site-a",
        name="Earthrise Block A",
        operator="Earthrise Nutritionals",
        species="Spirulina platensis",
        pond_type="open raceway",
        pond_area_m2=58_000,
        facility_acres=108,
        commissioning_date="2024-04-01",
        location="Calipatria, Imperial Valley, California, USA",
        aoi=AOI(lat=33.16315, lon=-115.51116, width_m=300, height_m=200),
    ),
    Site(
        site_id="site-c",
        name="Earthrise Block B",
        operator="Earthrise Nutritionals",
        species="Spirulina platensis",
        pond_type="open raceway",
        pond_area_m2=49_000,
        facility_acres=108,
        commissioning_date="2024-04-01",
        location="Calipatria, Imperial Valley, California, USA",
        aoi=AOI(lat=33.16513, lon=-115.51137, width_m=260, height_m=200),
    ),
    Site(
        site_id="site-d",
        name="Earthrise Block C",
        operator="Earthrise Nutritionals",
        species="Spirulina platensis",
        pond_type="open raceway",
        pond_area_m2=48_000,
        facility_acres=108,
        commissioning_date="2024-04-01",
        location="Calipatria, Imperial Valley, California, USA",
        aoi=AOI(lat=33.16827, lon=-115.51272, width_m=360, height_m=140),
    ),
    # --- Cyanotech, Keahole Point HI -- three of its raceway blocks
    Site(
        site_id="site-b",
        name="Cyanotech Block A",
        operator="Cyanotech Corporation",
        species="Haematococcus pluvialis",
        pond_type="open raceway",
        pond_area_m2=44_000,
        facility_acres=96,
        commissioning_date="2024-06-15",
        location="Keahole Point, Kailua-Kona, Hawaii, USA",
        aoi=AOI(lat=19.73007, lon=-156.05516, width_m=220, height_m=360),
    ),
    Site(
        site_id="site-e",
        name="Cyanotech Block B",
        operator="Cyanotech Corporation",
        species="Haematococcus pluvialis",
        pond_type="open raceway",
        pond_area_m2=35_000,
        facility_acres=96,
        commissioning_date="2024-06-15",
        location="Keahole Point, Kailua-Kona, Hawaii, USA",
        aoi=AOI(lat=19.72845, lon=-156.05373, width_m=160, height_m=320),
    ),
    Site(
        site_id="site-f",
        name="Cyanotech Block C",
        operator="Cyanotech Corporation",
        species="Haematococcus pluvialis",
        pond_type="open raceway",
        pond_area_m2=18_000,
        facility_acres=96,
        commissioning_date="2024-06-15",
        location="Keahole Point, Kailua-Kona, Hawaii, USA",
        aoi=AOI(lat=19.73061, lon=-156.05688, width_m=140, height_m=200),
    ),
]

SITES_BY_ID = {s.site_id: s for s in SITES}

# Dropped candidate: E.I.D. Parry's Oonaiyur farm (Chettinad, Tamil Nadu).
# The facility is real and documented at ~135 acres, but it is not separable
# from its surroundings in Sentinel-2: the AOI returns zero water pixels
# (SCL water 0.00, NDWI -0.41), and a persistent-high-NDCI scan over an 8 km
# box yields 4,053 clusters at NDCI ~+0.43 -- that is the surrounding Tamil
# Nadu cropland, which is just as chlorophyll-rich as a pond would be. Any
# index sampled there would measure fields, not algae, so it was cut rather
# than shipped unverified.

# Demo reporting window -- matches the API contract examples in architecture.md.
WINDOW_START = "2026-08-01"
WINDOW_END = "2026-09-11"
