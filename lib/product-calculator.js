// AI Product Calculator - estimates product quantities per job based on aircraft dimensions

// Default product ratios by service type
// ratio_type 'exterior' uses surface_area_sqft, 'interior' uses length_ft
export const DEFAULT_PRODUCT_RATIOS = {
  ceramic: [
    { product_name: 'Ceramic Coating', ratio: 1, per_sqft: 50, ratio_type: 'exterior', unit: 'oz' },
    { product_name: 'Prep Spray', ratio: 1, per_sqft: 100, ratio_type: 'exterior', unit: 'oz' },
  ],
  ext_wash: [
    { product_name: 'Wash Soap', ratio: 2, per_sqft: 100, ratio_type: 'exterior', unit: 'oz' },
  ],
  decon: [
    { product_name: 'Iron Remover', ratio: 1, per_sqft: 75, ratio_type: 'exterior', unit: 'oz' },
    { product_name: 'Wash Soap', ratio: 2, per_sqft: 100, ratio_type: 'exterior', unit: 'oz' },
  ],
  polish: [
    { product_name: 'Polish Compound', ratio: 1, per_sqft: 60, ratio_type: 'exterior', unit: 'oz' },
  ],
  wax: [
    { product_name: 'Wax', ratio: 1, per_sqft: 80, ratio_type: 'exterior', unit: 'oz' },
  ],
  spray_ceramic: [
    { product_name: 'Spray Ceramic', ratio: 1, per_sqft: 100, ratio_type: 'exterior', unit: 'oz' },
  ],
  brightwork: [
    { product_name: 'Metal Polish', ratio: 1, per_sqft: 40, ratio_type: 'exterior', unit: 'oz' },
  ],
  interior: [
    { product_name: 'Interior Cleaner', ratio: 1, per_ft: 10, ratio_type: 'interior', unit: 'oz' },
  ],
  leather: [
    { product_name: 'Leather Conditioner', ratio: 0.5, per_ft: 10, ratio_type: 'interior', unit: 'oz' },
    { product_name: 'Leather Cleaner', ratio: 0.5, per_ft: 10, ratio_type: 'interior', unit: 'oz' },
  ],
  carpet: [
    { product_name: 'Carpet Cleaner', ratio: 1, per_ft: 8, ratio_type: 'interior', unit: 'oz' },
  ],
};

// Map service name to a ratio key - mirrors getHoursForService() in dashboard
export function getServiceRatioKey(serviceName) {
  const name = (serviceName || '').toLowerCase();
  if (name.includes('spray ceramic') || name.includes('spray coat') || name.includes('topcoat')) return 'spray_ceramic';
  if (name.includes('ceramic')) return 'ceramic';
  if (name.includes('decon')) return 'decon';
  if (name.includes('brightwork') || name.includes('bright') || name.includes('chrome')) return 'brightwork';
  if (name.includes('polish')) return 'polish';
  if (name.includes('wax')) return 'wax';
  if (name.includes('leather')) return 'leather';
  if (name.includes('carpet') || name.includes('extract') || name.includes('upholster')) return 'carpet';
  if (name.includes('interior') || name.includes('vacuum') || name.includes('wipe') || name.includes('cabin')) return 'interior';
  return 'ext_wash';
}

// Calculate product estimates for selected services + aircraft dimensions
export function calculateProductEstimates(selectedServices, aircraft, customRatios) {
  const surfaceArea = parseFloat(aircraft?.surface_area_sqft) || 0;
  const length = parseFloat(aircraft?.length_ft) || 0;

  if ((!surfaceArea && !length) || !selectedServices || selectedServices.length === 0) return [];

  const ratios = customRatios || DEFAULT_PRODUCT_RATIOS;
  const productMap = {};

  for (const svc of selectedServices) {
    const ratioKey = getServiceRatioKey(svc.name);
    const productRatios = ratios[ratioKey];
    if (!productRatios) continue;

    for (const pr of productRatios) {
      let amount;
      if (pr.ratio_type === 'interior') {
        if (!length) continue;
        amount = (length / (pr.per_ft || 10)) * (pr.ratio || 1);
      } else {
        if (!surfaceArea) continue;
        amount = (surfaceArea / (pr.per_sqft || 50)) * (pr.ratio || 1);
      }

      const rounded = Math.ceil(amount);
      if (rounded <= 0) continue;

      if (productMap[pr.product_name]) {
        productMap[pr.product_name].amount += rounded;
      } else {
        productMap[pr.product_name] = {
          product_name: pr.product_name,
          amount: rounded,
          unit: pr.unit || 'oz',
        };
      }
    }
  }

  return Object.values(productMap);
}

// Format estimates for display: "48oz ceramic coating, 24oz prep spray"
export function formatEstimates(estimates) {
  return estimates.map(e => `${e.amount}${e.unit} ${e.product_name.toLowerCase()}`).join(', ');
}

// Service type labels for settings UI
export const SERVICE_TYPE_LABELS = {
  ceramic: 'Ceramic Coating',
  ext_wash: 'Exterior Wash',
  decon: 'Decontamination',
  polish: 'Polish',
  wax: 'Wax',
  spray_ceramic: 'Spray Ceramic',
  brightwork: 'Brightwork',
  interior: 'Interior Detail',
  leather: 'Leather Care',
  carpet: 'Carpet Cleaning',
};
