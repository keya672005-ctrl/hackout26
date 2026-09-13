"""Phase 5: the credit-readiness report -- architecture.md §3 `/report`.

This is the document a buyer, auditor or registry would actually be handed, so
it is assembled here rather than in the browser. Three decisions are worth
defending out loud:

* **The report id is a content fingerprint, not a serial number.** The contract
  sketches `"AT-2026-0091"`, which reads like a counter in a registry we do not
  have -- and inventing a sequence implies an issuing authority this platform is
  not. Instead the id is derived by hashing the things the report asserts: the
  site, the period, the CO2 figure, the verdict and the rule that produced it.
  Two useful properties fall out. Re-running the demo produces the *same* id, so
  a screenshot taken yesterday still matches the running system; and changing
  any number the report claims produces a *different* id, so a doctored figure
  cannot keep its identifier. That is closer to what an MRV document needs than
  an incrementing integer would be.

* **`generated_at` is the wall clock; the id is not.** When the report was
  printed is a genuine fact about the document, so it is reported honestly. But
  it is deliberately excluded from the fingerprint -- otherwise the same data
  would mint a new identity every refresh, and the id would prove nothing.

* **`agreement_pct` is the complement of the *peak* divergence**, not of the
  average and not of the latest value. Phase 3 makes the verdict on the peak,
  and an agreement score generous enough to disagree with the badge beside it
  would be worse than no score at all. site-b reads 73.2% agreement against a
  26.8% peak divergence, while its *latest* window has recovered to +12.3% --
  the kinder number would have put "94% agreement" next to "Needs review".

Nothing here recomputes a number that already exists upstream: the CO2 figure
comes from `engine.co2` and the verdict from `verification.reconcile`, so the
report cannot drift from the dashboard that links to it.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, asdict
from datetime import datetime, timezone

from engine import co2
from verification import reconcile

#: Prefix on every report id. "BF" = BioFix; the year that follows is the
#: reporting period's own year, not the year the document was printed.
#:
#: The prefix is NOT part of the fingerprint -- `_fingerprint()` hashes the
#: site, period, figure, verdict and rule only. So renaming the product moved
#: AC-2026-83D755 to BF-2026-83D755 and left the six hex digits alone, which
#: is the property worth having: the id still changes if and only if a
#: published figure changes.
ID_PREFIX = "BF"

#: Hex digits of the fingerprint kept in the id. Six is short enough to read
#: aloud in a demo and wide enough (16.7M) that a collision across a handful of
#: sites is not a practical concern.
ID_DIGITS = 6


@dataclass(frozen=True)
class Report:
    """The architecture.md §3 `/report` payload, exactly."""

    site_id: str
    report_id: str
    generated_at: str
    reporting_period: str
    co2_sequestered_kg: float
    status: str
    agreement_pct: float

    def as_dict(self) -> dict:
        return asdict(self)


def _fingerprint(site_id: str, period: str, co2_kg: float,
                 status: str, divergence_pct: float, rule_id: str) -> str:
    """Stable short id over everything the report asserts.

    Figures are formatted to the precision the report *displays*, so the id
    changes when a published number changes and not when a float wobbles in the
    last decimal place.
    """
    payload = "|".join([
        site_id,
        period,
        f"{co2_kg:.2f}",
        status,
        f"{divergence_pct:.2f}",
        rule_id,
    ])
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return digest[:ID_DIGITS].upper()


def build(site_id: str, range_days: int | None = None) -> Report:
    """Assemble the report for one site over the requested window.

    Raises `store.UnknownSiteError` for an unknown site (the route maps it to a
    404). A *known* site with no readings is not an error -- it returns a report
    that says so, because "this pond has not reported" is a real state and one
    a reviewer needs to see stated rather than inferred from a blank page.
    """
    series = co2.daily_series(site_id, range_days)
    verdict = reconcile.reconcile(site_id, range_days=range_days)

    if series:
        first, last = series[0].date, series[-1].date
        period = f"{first} to {last} ({len(series)} days)"
        year = last[:4]
        total = series[-1].co2_uptake_cum_kg
    else:
        # No readings in the window. The figure is zero and the period says why,
        # rather than the document quietly printing an empty range.
        period = "No sensor readings in the requested window"
        year = str(datetime.now(timezone.utc).year)
        total = 0.0

    # Agreement is the complement of the peak divergence the verdict was made
    # on. Clamped at zero: a site diverging by more than 100% does not have
    # negative agreement, it has none.
    agreement = max(0.0, 100.0 - abs(verdict.divergence_pct))

    return Report(
        site_id=site_id,
        report_id=f"{ID_PREFIX}-{year}-{_fingerprint(site_id, period, total, verdict.status, verdict.divergence_pct, verdict.rule_id)}",
        generated_at=datetime.now(timezone.utc).date().isoformat(),
        reporting_period=period,
        co2_sequestered_kg=total,
        status=verdict.status,
        agreement_pct=round(agreement, 1),
    )
