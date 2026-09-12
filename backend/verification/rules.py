"""Verification rule configuration.

Thresholds live here rather than inline in the comparison code -- PRD 11
Phase 3 requires the tolerance to be configurable, and a verifier being able to
point at the rule that fired is the whole premise of the platform.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class VerificationRule:
    rule_id: str
    description: str
    #: Permitted divergence between the two normalised trends, percent.
    tolerance_pct: float
    #: Smoothing/comparison window, days. Also the length of the calibration
    #: baseline at the start of the record.
    rolling_window_days: int
    #: Consecutive out-of-tolerance days needed before a site is flagged, so a
    #: single noisy day is not by itself an accusation of misreporting.
    consecutive_breaches_to_flag: int
    #: Days whose sensor record is thinner than this fraction of a full 24 h are
    #: dropped from the comparison rather than back-filled (Phase 2 stance:
    #: missing data stays missing).
    min_daily_coverage: float = 0.5
    #: Acquisitions cloudier than this are dropped -- a cloud index is not a
    #: chlorophyll index. Inert on the current seed data (max 0.006) but it is
    #: the gate a real MRV pipeline needs.
    max_cloud_fraction: float = 0.35


#: Active rule set. `tolerance_pct` is the permitted divergence between the
#: sensor-derived CO2 trend and the satellite chlorophyll proxy, both compared
#: as normalised trends over the rolling window (absolute units are not
#: comparable -- one is kg, the other a dimensionless band index).
RULES = [
    VerificationRule(
        rule_id="RULE-001",
        description=("Sensor-derived CO2 uptake trend must track the satellite "
                     "chlorophyll proxy within tolerance over a rolling window."),
        tolerance_pct=15.0,
        rolling_window_days=14,
        consecutive_breaches_to_flag=2,
    ),
]

ACTIVE_RULE = RULES[0]
