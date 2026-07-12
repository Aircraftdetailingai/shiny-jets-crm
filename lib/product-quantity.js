// Single source of truth for how much of a tagged product a service consumes.
//
// service_products rows carry TWO honest quantity columns:
//   quantity_per_job   — a flat amount used every time the service runs
//   quantity_per_sqft  — an amount scaled by the aircraft's exterior surface area
//
// Older code read `fixed_quantity` / `quantity_per_hour`, which do NOT exist on
// the table — so every linked-product quantity rendered as 0. This function is
// the schema-correct replacement, imported everywhere a quantity is computed
// (quote builder, job completion) and unit-tested in
// scripts/verify-product-quantities.mjs.
//
// @param {{quantity_per_job?: number|string|null, quantity_per_sqft?: number|string|null}} link
// @param {number} aircraftSqft  exterior surface area (from aircraft_hours.surface_area)
// @returns {number} total quantity of the product for one job
export function computeLinkedProductQuantity(link, aircraftSqft) {
  const perJob = parseFloat(link?.quantity_per_job) || 0;
  const perSqft = parseFloat(link?.quantity_per_sqft) || 0;
  const sqft = parseFloat(aircraftSqft) || 0;
  return perJob + perSqft * sqft;
}
