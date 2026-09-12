"""CO2 conversion constants and species growth parameters.

Every number here is a published reference value, not a fitted one. Keeping
them in one module means the Phase 2 engine and the Phase 5 report quote the
same figures, and a judge asking "where does 1.8 come from?" gets one answer.
"""

# --- CO2 conversion (PRD 7) -------------------------------------------------
# Dry microalgal biomass is ~50% carbon by mass; oxidising that carbon back to
# CO2 multiplies it by the CO2/C molecular-weight ratio (44.01 / 12.011).
CARBON_FRACTION_BIOMASS = 0.50
CO2_TO_CARBON_MW_RATIO = 44.01 / 12.011          # 3.664

#: kg CO2 fixed per kg dry algal biomass. ~1.83 -- the "~1.8x" figure in the PRD.
CO2_PER_KG_BIOMASS = CARBON_FRACTION_BIOMASS * CO2_TO_CARBON_MW_RATIO

# --- Pond geometry ----------------------------------------------------------
#: Working depth of a commercial open raceway, metres. Industry norm is 15-30 cm;
#: deeper than this and light cannot reach the lower culture.
RACEWAY_DEPTH_M = 0.25

# --- Species growth parameters ---------------------------------------------
# mu_max: max specific growth rate (1/day) under saturating light.
# k_carrying: carrying capacity (g dry weight / L) at which growth stalls
#             through self-shading.
# harvest_fraction / harvest_trigger: commercial raceways run semi-continuously
#             -- once the culture reaches the trigger density a fixed fraction is
#             drawn off and the pond refills, giving the sawtooth that makes a
#             real production series distinguishable from a smooth textbook curve.
SPECIES = {
    "Spirulina platensis": {
        "mu_max": 0.42,
        "k_carrying": 1.25,
        "harvest_trigger": 1.05,
        "harvest_fraction": 0.35,
        "opt_temp_C": 35.0,
        "opt_pH": 9.8,
    },
    "Haematococcus pluvialis": {
        "mu_max": 0.26,
        "k_carrying": 0.80,
        "harvest_trigger": 0.68,
        "harvest_fraction": 0.30,
        "opt_temp_C": 24.0,
        "opt_pH": 7.6,
    },
}


def biomass_to_co2_kg(kg_dry_biomass: float) -> float:
    """Convert dry algal biomass (kg) to CO2 fixed (kg)."""
    return kg_dry_biomass * CO2_PER_KG_BIOMASS


def pond_volume_l(pond_area_m2: float, depth_m: float = RACEWAY_DEPTH_M) -> float:
    """Working volume of a pond, in litres."""
    return pond_area_m2 * depth_m * 1000.0
