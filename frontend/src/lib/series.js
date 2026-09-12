// Shaping the two API series into one chart-ready table.
//
// The sensor record is in g/L and the satellite proxy is a dimensionless band
// index, so they cannot share a value axis — and a two-y-axis chart would
// invent a correlation by choosing where the scales line up. Both are therefore
// **indexed to 100 at the start of the window** and drawn on one axis, which is
// also exactly what the backend's RULE-001 compares (normalised trends, never
// absolute levels). The chart shows the reconciliation rather than decorating it.

/** Index a series to 100 at its first usable value. */
const toIndex = (value, base) =>
  typeof value === 'number' && typeof base === 'number' && base !== 0
    ? (value / base) * 100
    : null

/**
 * Merge the readings and imagery series into rows the chart can render.
 *
 * Satellite acquisitions are sparse (a handful over six weeks), so their rows
 * are null on the days nothing was photographed and the line is drawn with
 * `connectNulls`. Nothing is interpolated into the data itself — a gap in the
 * chart is a day no satellite passed, and it should look like one.
 */
export function buildReconciliation(readings = [], imagery = []) {
  const ndciByDate = new Map(imagery.map((p) => [p.date, p.ndci_value]))

  const sensorBase = readings.find((p) => typeof p.biomass_density_g_L === 'number')
    ?.biomass_density_g_L
  const satelliteBase = imagery.find((p) => typeof p.ndci_value === 'number')?.ndci_value

  // Days the sensor reported, plus any acquisition date outside that set.
  const dates = [...new Set([...readings.map((p) => p.date), ...ndciByDate.keys()])].sort()

  return dates.map((date) => {
    const reading = readings.find((p) => p.date === date)
    const ndci = ndciByDate.get(date)
    return {
      date,
      sensor: toIndex(reading?.biomass_density_g_L, sensorBase),
      satellite: toIndex(ndci, satelliteBase),
      density: reading?.biomass_density_g_L ?? null,
      ndci: typeof ndci === 'number' ? ndci : null,
    }
  })
}

/** Cumulative CO2 rows for the single-series chart. */
export function buildCo2(readings = []) {
  return readings.map((p) => ({ date: p.date, co2: p.co2_uptake_cum_kg }))
}

/** The reporting window as a human phrase, read off the data rather than the clock. */
export function windowLabel(readings = []) {
  if (!readings.length) return '—'
  return `${readings[0].date} to ${readings[readings.length - 1].date}`
}
