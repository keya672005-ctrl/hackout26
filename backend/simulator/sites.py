"""Demo site definitions.

All three are real, operating commercial open-raceway algae facilities. The
`aoi` box for each was hand-delineated from a cloud-free Sentinel-2 scene so it
covers the pond block and excludes surrounding cropland -- this matters because
NDCI is also high over land vegetation, so a pure threshold would happily
measure a neighbouring alfalfa field. The footprint is fixed once and reused for
every date, which is what makes the time series comparable.

`pond_area_m2` is the measured pond-block footprint, not the full facility
acreage (which includes buildings, drying beds and roads) -- the CO2 maths in
Phase 2 needs cultivation area, not property area.
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
    Site(
        site_id="site-a",
        name="Site A -- Earthrise Raceway Block",
        operator="Earthrise Nutritionals",
        species="Spirulina platensis",
        pond_type="open raceway",
        pond_area_m2=181_000,
        facility_acres=108,
        commissioning_date="2024-04-01",
        location="Calipatria, Imperial Valley, California, USA",
        aoi=AOI(lat=33.16558, lon=-115.51220, width_m=560, height_m=780),
    ),
    Site(
        site_id="site-b",
        name="Site B -- Cyanotech Keahole Ponds",
        operator="Cyanotech Corporation",
        species="Haematococcus pluvialis",
        pond_type="open raceway",
        pond_area_m2=90_000,
        facility_acres=96,
        commissioning_date="2024-06-15",
        location="Keahole Point, Kailua-Kona, Hawaii, USA",
        aoi=AOI(lat=19.72935, lon=-156.05526, width_m=480, height_m=520),
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
