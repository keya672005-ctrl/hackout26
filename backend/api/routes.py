"""API route handlers — the contract in architecture.md §3.

Routes are thin on purpose: parse the query, call the engine, hand the result
to a response model. All arithmetic lives in `engine/`, all reconciliation will
live in `verification/`, so there is exactly one place to look when a number on
screen is questioned.

Shipped in Phase 2: /ping, /sites, /sites/{id}, /sites/{id}/readings,
/sites/{id}/imagery-index. Phase 3 added /sites/{id}/verification and replaced
the placeholder status with the real verdict. Phase 5 added /sites/{id}/report.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from api.schemas import (
    ImageryResponse,
    ReadingsResponse,
    SiteDetail,
    ReconciliationResponse,
    ReportResponse,
    SiteSummary,
    VerificationResponse,
)
from engine import co2, store
from reporting import report
from verification import reconcile

router = APIRouter()

#: Sparkline resolution on the overview cards (architecture.md §3 shows 6).
TREND_POINTS = 6


def _range_days(range_: str | None) -> int | None:
    """Parse `?range=`, turning a bad value into a 400 rather than a 500."""
    try:
        return co2.parse_range(range_)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _require_site(site_id: str):
    try:
        return store.site(site_id)
    except store.UnknownSiteError as exc:
        raise HTTPException(
            status_code=404, detail=f"unknown site {site_id!r}") from exc


@router.get("/ping")
def ping():
    """Placeholder endpoint — proves the API is wired up end to end."""
    return {
        "message": "pong",
        "service": "algae-carbon-api",
        "phase": 0,
    }


@router.get("/sites", response_model=list[SiteSummary])
def list_sites(range: str | None = Query(None, description="e.g. '6w', '30d', 'all'")):
    """Site Overview: headline CO2 figure and sparkline for every demo site."""
    days = _range_days(range)
    out = []
    for row in store.sites().itertuples():
        out.append(SiteSummary(
            site_id=row.site_id,
            name=row.name,
            species=row.species,
            operator=row.operator,
            location=row.location,
            co2_sequestered_kg=co2.total_co2_kg(row.site_id, days),
            status=reconcile.status_for(row.site_id, days),
            trend=co2.co2_trend(row.site_id, TREND_POINTS, days),
        ))
    return out


@router.get("/sites/{site_id}", response_model=SiteDetail)
def get_site(site_id: str):
    """Site Detail header: the metadata block for one site."""
    s = _require_site(site_id)
    return SiteDetail(
        site_id=s.site_id,
        name=s["name"],
        species=s.species,
        pond_type=s.pond_type,
        pond_area_m2=int(s.pond_area_m2),
        commissioning_date=s.commissioning_date,
        status=reconcile.status_for(s.site_id),
    )


@router.get("/sites/{site_id}/readings", response_model=ReadingsResponse)
def get_readings(site_id: str,
                 range: str | None = Query(None, description="e.g. '6w', '30d', 'all'")):
    """Sensor line: daily biomass, water chemistry and cumulative CO2 fixed.

    Cumulative CO2 accumulates from the start of the requested range, so the
    series is self-consistent with whatever period the chart is showing.
    """
    _require_site(site_id)
    days = _range_days(range)
    return ReadingsResponse(
        site_id=site_id,
        series=[p.as_dict() for p in co2.daily_series(site_id, days)],
    )


@router.get("/sites/{site_id}/imagery-index", response_model=ImageryResponse)
def get_imagery_index(site_id: str,
                      range: str | None = Query(None, description="e.g. '6w', '30d', 'all'")):
    """Satellite line: the cached Sentinel-2 NDCI series.

    Served straight from the Phase 1 cache — the imagery API is never called at
    request time (PRD §12: no live satellite calls during the demo).
    """
    _require_site(site_id)
    days = _range_days(range)
    return ImageryResponse(
        site_id=site_id,
        series=co2.imagery_series(site_id, days),
    )


@router.get("/sites/{site_id}/verification", response_model=VerificationResponse)
def get_verification(site_id: str,
                     range: str | None = Query(None, description="e.g. '6w', '30d', 'all'")):
    """Verification Status panel: the sensor-vs-satellite reconciliation.

    The verdict, the number behind it and the rule that produced it, so the
    panel can say *why* a site is flagged rather than just that it is.
    """
    _require_site(site_id)
    days = _range_days(range)
    v = reconcile.reconcile(site_id, range_days=days)
    return VerificationResponse(
        site_id=v.site_id,
        status=v.status,
        divergence_pct=v.divergence_pct,
        tolerance_pct=v.tolerance_pct,
        explanation=v.explanation,
    )


@router.get("/sites/{site_id}/reconciliation", response_model=ReconciliationResponse)
def get_reconciliation(site_id: str,
                       range: str | None = Query(None, description="e.g. '6w', '30d', 'all'")):
    """The two normalised trends RULE-001 compares, day by day.

    Both series are indexed to 100 at the calibration baseline, which is what
    makes a kg-scale sensor record and a dimensionless band index comparable on
    one axis. Served from the same function that produces the verdict, so the
    chart and the badge can never tell different stories.
    """
    _require_site(site_id)
    days = _range_days(range)
    frame = reconcile.divergence_series(site_id, range_days=days)
    rule = reconcile.ACTIVE_RULE
    series = [
        {
            "date": row.date,
            "sensor_index": round(row.sensor_index * 100.0, 2),
            "satellite_index": round(row.satellite_index * 100.0, 2),
            "divergence_pct": round(row.divergence * 100.0, 2),
        }
        for row in frame.itertuples()
    ] if not frame.empty else []
    return ReconciliationResponse(
        site_id=site_id, tolerance_pct=rule.tolerance_pct, series=series)


@router.get("/sites/{site_id}/report", response_model=ReportResponse)
def get_report(site_id: str,
               range: str | None = Query(None, description="e.g. '6w', '30d', 'all'")):
    """The credit-readiness report for one site over the requested window.

    Assembled in `reporting/report.py` from the same engine and verification
    calls the dashboard uses, so the exported document and the screen it was
    opened from cannot state different figures.
    """
    _require_site(site_id)
    days = _range_days(range)
    return ReportResponse(**report.build(site_id, days).as_dict())
