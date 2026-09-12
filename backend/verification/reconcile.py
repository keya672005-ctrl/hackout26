"""Phase 3 reconciliation: does the sensor record agree with the satellite?

This is the module the whole pitch rests on -- "we don't just show sensor
numbers, we prove them" -- so it is written to be read by a sceptic.

The comparison, end to end:

    reported biomass density (g/L, daily)  ->  smoothed over the rule window
    satellite NDCI (per acquisition)       ->  daily-interpolated, same smoothing
    each divided by its own value in the calibration window  ->  two indices
    divergence = sensor index / satellite index - 1

Three choices worth defending out loud:

* **Density, not daily CO2.** NDCI is a *standing chlorophyll* proxy: it sees
  how much algae is in the pond, not how fast it is growing. Its like-for-like
  sensor counterpart is reported biomass density. Pairing it with daily
  production instead inverts the test -- as a culture approaches carrying
  capacity its growth *rate* falls while its standing crop is at its highest,
  so an honest site scores as diverging. Verifying density verifies the CO2
  claim regardless, because the Phase 2 CO2 figure is a fixed multiple of the
  same reported biomass.
* **Normalised trends, never absolute levels.** One signal is g/L, the other a
  dimensionless band index; the constant relating them is unknown and
  site-specific. Only their *shapes* are comparable, so each is divided by its
  own calibration-window value. This is also the Phase 1 carry-over: site-a has
  a flat NDCI while site-b climbs, and comparing raw levels would score the
  flat-but-honest site worse than the drifting one.
* **The flag needs persistence, not a bad day.** A single day outside tolerance
  is weather, a cloud edge, or a harvest landing next to an acquisition. Only a
  run of consecutive out-of-tolerance days is evidence of misreporting, which is
  what `consecutive_breaches_to_flag` encodes.

A site that cannot be reconciled is **not** verified. Absence of evidence is not
evidence of agreement, so too little data, no imagery and no readings all return
"needs_review" with an explanation saying so -- never a quiet pass.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from engine import co2, store
from verification.rules import ACTIVE_RULE, VerificationRule


@dataclass(frozen=True)
class Verdict:
    """One verification result.

    The first five fields are the architecture.md section 3 contract; the rest
    are the working behind them, used by the Phase 3 gate and the Phase 5
    report.
    """

    site_id: str
    status: str                      # "verified" | "needs_review"
    #: The *largest* divergence seen over the reporting period, signed. The
    #: peak rather than the latest value, because that is the number the
    #: verdict was actually made on -- a site can drift far outside tolerance
    #: for a fortnight and then partly recover, and a panel reading only the
    #: latest figure would show a flagged site sitting inside its own
    #: tolerance. `latest_divergence_pct` carries the current state alongside
    #: it, so the recovery is visible rather than hidden.
    divergence_pct: float
    tolerance_pct: float
    explanation: str
    rule_id: str
    days_compared: int
    longest_breach_run: int
    latest_divergence_pct: float


def _unreconcilable(site_id: str, rule: VerificationRule, why: str) -> Verdict:
    """A site we cannot check is flagged for review, not waved through."""
    return Verdict(
        site_id=site_id,
        status="needs_review",
        divergence_pct=0.0,
        tolerance_pct=rule.tolerance_pct,
        explanation=(f"Cannot reconcile this site: {why}. Not verified -- "
                     f"an unchecked figure is not a checked one."),
        rule_id=rule.rule_id,
        days_compared=0,
        longest_breach_run=0,
        latest_divergence_pct=0.0,
    )


def _longest_run(flags: np.ndarray) -> int:
    """Length of the longest run of consecutive True values."""
    best = current = 0
    for flag in flags:
        current = current + 1 if flag else 0
        best = max(best, current)
    return best


def divergence_series(site_id: str,
                      rule: VerificationRule = ACTIVE_RULE,
                      range_days: int | None = None) -> pd.DataFrame:
    """Per-day divergence between the two normalised trends.

    Returns a frame with columns `date`, `sensor_index`, `satellite_index` and
    `divergence` (a fraction, not a percent), starting at the end of the
    calibration window. Empty if the site cannot be reconciled. Exposed
    separately from the verdict so the gate can audit the working and Phase 4
    can plot it.
    """
    window = rule.rolling_window_days

    series = [p for p in co2.daily_series(site_id, range_days)
              if p.coverage >= rule.min_daily_coverage]
    img = store.imagery(site_id)
    if not series or img.empty:
        return pd.DataFrame()

    img = img[img["cloud_fraction"] <= rule.max_cloud_fraction]
    if img.empty:
        return pd.DataFrame()

    # Only compare days the satellite actually covers. np.interp would happily
    # flat-extrapolate past the first and last acquisition, inventing imagery
    # for dates on which nothing was photographed.
    first, last = img["date"].min(), img["date"].max()
    dates = pd.to_datetime([p.date for p in series])
    inside = (dates >= first) & (dates <= last)
    dates = dates[inside]
    density = np.array([p.biomass_density_g_L for p in series])[inside]
    if len(dates) < 2 * window:
        return pd.DataFrame()

    ndci = np.interp(dates.astype("int64"),
                     img["date"].astype("int64"), img["ndci_value"])

    # Smooth both over the rule window: harvests sawtooth the sensor line and
    # acquisitions are sparse enough to alias it, so a day-on-day comparison
    # would be comparing noise.
    sensor = pd.Series(density).rolling(window).mean()
    satellite = pd.Series(ndci).rolling(window).mean()

    # Calibration baseline: the first full window. Everything after is measured
    # against the relationship the two signals had then.
    base_sensor = sensor.iloc[window - 1]
    base_satellite = satellite.iloc[window - 1]
    if not (base_sensor > 0 and base_satellite > 0):
        return pd.DataFrame()

    out = pd.DataFrame({
        "date": [d.date().isoformat() for d in dates],
        "sensor_index": (sensor / base_sensor).to_numpy(),
        "satellite_index": (satellite / base_satellite).to_numpy(),
    }).iloc[window - 1:].reset_index(drop=True)
    out["divergence"] = out["sensor_index"] / out["satellite_index"] - 1.0
    return out


def reconcile(site_id: str,
              rule: VerificationRule = ACTIVE_RULE,
              range_days: int | None = None) -> Verdict:
    """Compare one sensor record against its satellite proxy.

    Raises store.UnknownSiteError for an unknown id, which the API maps to 404.
    """
    store.site(site_id)                      # validates the id -> 404

    if not co2.daily_series(site_id, range_days):
        return _unreconcilable(
            site_id, rule, "the site has not reported any sensor readings")

    frame = divergence_series(site_id, rule, range_days)
    if frame.empty:
        return _unreconcilable(
            site_id, rule,
            f"fewer than {2 * rule.rolling_window_days} days of sensor readings "
            f"overlap usable imagery, so there is no baseline to compare against")

    div = frame["divergence"].to_numpy()
    breaches = np.abs(div) > rule.tolerance_pct / 100.0
    run = _longest_run(breaches)
    latest = float(div[-1])
    peak = float(div[np.argmax(np.abs(div))])
    flagged = run >= rule.consecutive_breaches_to_flag

    if flagged:
        direction = "above" if peak >= 0 else "below"
        spell = f"{run} consecutive days"
        if run >= 14:
            spell += f" ({run / 7:.0f} consecutive weeks)"
        explanation = (
            f"Sensor-reported biomass -- the basis of the CO2 figure -- ran "
            f"{direction} the satellite chlorophyll proxy by up to "
            f"{abs(peak):.1%}, outside the {rule.tolerance_pct:.0f}% tolerance "
            f"for {spell} of the {len(div)} compared. {rule.rule_id} flagged "
            f"this site for review. Currently {latest:+.1%}."
        )
    elif abs(peak) > rule.tolerance_pct / 100.0:
        # Touched the line but never held it: worth showing, not worth an
        # accusation. This is exactly what consecutive_breaches_to_flag is for.
        explanation = (
            f"Sensor-reported biomass touched {abs(peak):.1%} against the "
            f"satellite chlorophyll proxy, outside the "
            f"{rule.tolerance_pct:.0f}% tolerance but never for the "
            f"{rule.consecutive_breaches_to_flag} consecutive days "
            f"{rule.rule_id} requires before flagging. No sustained divergence "
            f"across the {len(div)} compared days; currently {latest:+.1%}."
        )
    else:
        explanation = (
            f"Sensor-reported biomass tracks the satellite chlorophyll proxy "
            f"within the {rule.tolerance_pct:.0f}% tolerance across all "
            f"{len(div)} compared days (peak {peak:+.1%}, currently "
            f"{latest:+.1%}). {rule.rule_id} found no sustained divergence."
        )

    return Verdict(
        site_id=site_id,
        status="needs_review" if flagged else "verified",
        divergence_pct=round(peak * 100.0, 1),
        tolerance_pct=rule.tolerance_pct,
        explanation=explanation,
        rule_id=rule.rule_id,
        days_compared=len(div),
        longest_breach_run=run,
        latest_divergence_pct=round(latest * 100.0, 1),
    )


def status_for(site_id: str, range_days: int | None = None) -> str:
    """Just the badge value, for the list and detail endpoints."""
    return reconcile(site_id, ACTIVE_RULE, range_days).status
