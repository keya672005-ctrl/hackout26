"""Response models for the API contract in architecture.md §3.

These exist so the contract is enforced by the framework rather than by
discipline: FastAPI serialises through these models, so an engine value that
grows an extra field never leaks into a response and a missing one fails loudly
here instead of as `undefined` in a Phase 4 chart.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

#: The contract enum, narrowed to its two real values now that the Phase 3
#: reconciliation engine produces a real verdict. The Phase 2 "pending"
#: placeholder is gone -- every status on screen is now one a rule decided.
SiteStatus = Literal["verified", "needs_review"]


class SiteSummary(BaseModel):
    """One row of the Site Overview screen."""

    site_id: str
    name: str
    species: str
    # Operator and location travel with the summary so the overview can group
    # and filter by facility without a second round-trip. Six blocks across two
    # facilities is already more than a reader wants as one flat list.
    operator: str
    location: str
    co2_sequestered_kg: float
    status: SiteStatus
    trend: list[float] = Field(description="Cumulative-CO2 sparkline points.")


class SiteDetail(BaseModel):
    """Header block of the Site Detail screen."""

    site_id: str
    name: str
    species: str
    pond_type: str
    pond_area_m2: int
    commissioning_date: str
    status: SiteStatus


class ReadingPoint(BaseModel):
    """One day of the sensor line."""

    date: str
    biomass_density_g_L: float
    co2_uptake_cum_kg: float
    water_temp_C: float
    pH: float
    dissolved_O2_mg_L: float
    dissolved_CO2_mg_L: float
    turbidity_NTU: float


class ReadingsResponse(BaseModel):
    site_id: str
    series: list[ReadingPoint]


class ImageryPoint(BaseModel):
    """One Sentinel-2 acquisition of the satellite line."""

    date: str
    ndci_value: float


class ImageryResponse(BaseModel):
    site_id: str
    series: list[ImageryPoint]


class VerificationResponse(BaseModel):
    """Verification Status panel -- the output of verification/reconcile.py.

    `divergence_pct` is the largest divergence observed over the reporting
    period, so it is directly comparable with `tolerance_pct` and consistent
    with `status`; the current value lives in the explanation rather than in a
    second headline number the panel would have to caption.
    """

    site_id: str
    status: SiteStatus
    divergence_pct: float
    tolerance_pct: float
    explanation: str


class ReconciliationPoint(BaseModel):
    """One day of the reconciliation, as RULE-001 sees it."""

    date: str
    sensor_index: float
    satellite_index: float
    divergence_pct: float


class ReconciliationResponse(BaseModel):
    """The working behind the verdict, for the sensor-vs-satellite chart.

    Not part of the architecture.md section 3 contract -- it is additive, and
    exists so the chart plots the engine's own normalised trends instead of
    re-deriving them in the browser. A chart that computed its own version of
    the comparison could disagree with the badge printed next to it.
    """

    site_id: str
    tolerance_pct: float
    series: list[ReconciliationPoint]


class ReportResponse(BaseModel):
    """Investor / credit-readiness report -- architecture.md §3 `/report`.

    Exactly the contract's seven fields and nothing else. Everything a reader
    also needs (species, pond area, the rule text, the explanation) is already
    served by `/sites/{id}` and `/verification`, and duplicating it here would
    create two sources for one number on a document whose entire value is that
    its numbers agree.
    """

    site_id: str
    report_id: str = Field(
        description="Content fingerprint of the report's own claims -- stable "
                    "across re-runs, different if any published figure changes.")
    generated_at: str
    reporting_period: str
    co2_sequestered_kg: float
    status: SiteStatus
    agreement_pct: float = Field(
        description="100 minus the peak divergence the verdict was made on.")
