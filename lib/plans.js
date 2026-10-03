// Shiny Jets CRM — three-tier plan model (single source of truth).
//
//   free      $0                     5 sent quotes / month, 1 user, 5% platform fee
//   lite      $39.95 / mo            unlimited quotes, invoices, jobs, portal, AI… 1 user, 2% fee
//   business  $89.95 / mo · $899/yr  team (3 users), dispatch, reports, white-label… 0% fee
//
// Backward compatibility (code-level aliasing, no destructive migration):
//   detailers.plan = 'pro'        → treated as 'lite'
//   detailers.plan = 'enterprise' → treated as 'business'
//   detailers.plan = 'starter'    → treated as 'free'
// Dates (plan_expires_at, trial_ends_at) are untouched, so course-bundle
// Enterprise years and admin comps keep their end dates as Business.
//
// Pure module: no Next / Supabase imports, safe on server + client and in
// plain `node` tests (scripts/test-plans.mjs).

export const PLAN_IDS = ['free', 'lite', 'business'];

export const LEGACY_PLAN_ALIASES = {
  pro: 'lite',
  enterprise: 'business',
  starter: 'free',
};

const RANK = { free: 0, lite: 1, business: 2 };

export function normalizePlan(raw) {
  const p = String(raw || '').toLowerCase().trim();
  if (RANK[p] !== undefined) return p;
  if (LEGACY_PLAN_ALIASES[p]) return LEGACY_PLAN_ALIASES[p];
  return 'free';
}

export function planRank(raw) {
  return RANK[normalizePlan(raw)];
}

export function planAtLeast(raw, required) {
  return planRank(raw) >= RANK[normalizePlan(required)];
}

// Admin accounts (is_admin) pass every gate.
function resolveArgs(detailerOrPlan, opts = {}) {
  if (detailerOrPlan && typeof detailerOrPlan === 'object') {
    return {
      plan: normalizePlan(detailerOrPlan.plan),
      isAdmin: opts.isAdmin === true || detailerOrPlan.is_admin === true,
    };
  }
  return { plan: normalizePlan(detailerOrPlan), isAdmin: opts.isAdmin === true };
}

// ─── Pricing ───
export const PLAN_PRICES = {
  free: { monthly: 0, yearly: null },
  lite: { monthly: 39.95, yearly: null },
  business: { monthly: 89.95, yearly: 899 },
};

export const PLAN_NAMES = { free: 'Free', lite: 'Lite', business: 'Business' };

export function planName(raw) {
  return PLAN_NAMES[normalizePlan(raw)];
}

export function formatPlanPrice(plan) {
  const p = PLAN_PRICES[normalizePlan(plan)];
  if (!p || !p.monthly) return '$0';
  return `$${p.monthly.toFixed(2)}/mo`;
}

// Platform fee on customer payments (fraction of the charge).
export const PLAN_PLATFORM_FEES = { free: 0.05, lite: 0.02, business: 0 };

export function platformFeeForPlan(raw) {
  return PLAN_PLATFORM_FEES[normalizePlan(raw)];
}

// Users = the account owner + active team members.
export const PLAN_SEAT_LIMITS = { free: 1, lite: 1, business: 3 };

export function seatLimitForPlan(raw) {
  return PLAN_SEAT_LIMITS[normalizePlan(raw)];
}

// usedSeats includes the owner. Returns true when one more user fits.
export function canAddSeat(detailerOrPlan, usedSeats, opts = {}) {
  const { plan, isAdmin } = resolveArgs(detailerOrPlan, opts);
  if (isAdmin) return true;
  return Number(usedSeats || 0) < PLAN_SEAT_LIMITS[plan];
}

export const FREE_QUOTES_PER_MONTH = 5;

export function quotesPerMonth(raw) {
  return normalizePlan(raw) === 'free' ? FREE_QUOTES_PER_MONTH : Infinity;
}

// ─── Feature → minimum plan ───
export const FEATURES = {
  // Lite
  unlimitedQuotes: 'lite',
  quoteFollowups: 'lite',
  scheduledSend: 'lite',
  googleCalendar: 'lite',
  calendar: 'lite',
  invoices: 'lite',
  deposits: 'lite',
  bookNowPayLater: 'lite',
  jobs: 'lite',
  deliveryReports: 'lite',
  customerPortal: 'lite',
  detailingAi: 'lite',
  reviewRequests: 'lite',
  customLogo: 'lite',
  dataExport: 'lite',
  rewardsRedeem: 'lite',
  // Business
  team: 'business',
  crewApp: 'business',
  timeClock: 'business',
  payroll: 'business',
  dispatch: 'business',
  managerDashboard: 'business',
  changeOrders: 'business',
  reports: 'business',
  recurring: 'business',
  marketing: 'business',
  products: 'business',
  equipment: 'business',
  whiteLabel: 'business',
  customEmailDomain: 'business',
  directoryPriority: 'business',
  pricingTool: 'business',
  verifiedFinish: 'business',
  sms: 'business',
  aiChatWidget: 'business',
};

export const FEATURE_LABELS = {
  unlimitedQuotes: 'Unlimited quotes',
  quoteFollowups: 'Quote follow-ups',
  scheduledSend: 'Scheduled quote sending',
  googleCalendar: 'Google Calendar sync',
  calendar: 'Schedule & calendar',
  invoices: 'Invoices & payments',
  deposits: 'Deposits',
  bookNowPayLater: 'Book Now, Pay Later',
  jobs: 'Jobs, photos & completion reports',
  deliveryReports: 'Delivery reports',
  customerPortal: 'Customer portal & live aircraft progress',
  detailingAi: 'Detailing AI',
  reviewRequests: 'Review & feedback requests',
  customLogo: 'Your own logo on quotes',
  dataExport: 'Data export',
  rewardsRedeem: 'Reward redemption',
  team: 'Team members & roles',
  crewApp: 'Crew app',
  timeClock: 'PIN time clock',
  payroll: 'Payroll',
  dispatch: 'Dispatch board',
  managerDashboard: 'Manager dashboard',
  changeOrders: 'Change orders',
  reports: 'Reports & profitability',
  recurring: 'Recurring services',
  marketing: 'Marketing campaigns',
  products: 'Products & inventory',
  equipment: 'Equipment tracking',
  whiteLabel: 'Full white-label',
  customEmailDomain: 'Custom sending domain',
  directoryPriority: 'Top directory placement',
  pricingTool: 'Pricing Tool access',
  verifiedFinish: 'Verified Finish badge',
  sms: 'SMS notifications',
  aiChatWidget: 'AI chat bubble for your website',
};

export function requiredPlanFor(feature) {
  return FEATURES[feature] || 'free';
}

export function hasFeature(detailerOrPlan, feature, opts = {}) {
  const { plan, isAdmin } = resolveArgs(detailerOrPlan, opts);
  if (isAdmin) return true;
  const required = FEATURES[feature];
  if (!required) return true;
  return RANK[plan] >= RANK[required];
}

// ─── Upgrade destination (the CRM's own plan page) ───
export const UPGRADE_PATH = '/upgrade';

export function upgradeUrlFor(feature) {
  const req = feature ? requiredPlanFor(feature) : null;
  return req && req !== 'free' ? `${UPGRADE_PATH}?plan=${req}` : UPGRADE_PATH;
}

export function upgradeMessage(feature) {
  const req = requiredPlanFor(feature);
  const label = FEATURE_LABELS[feature] || 'This feature';
  const price = req === 'business' ? '$89.95/mo or $899/yr' : '$39.95/mo';
  return `${label} is included with ${PLAN_NAMES[req]} (${price}).`;
}

// JSON body for a 403 from an API route when the plan is too low.
export function planRequiredBody(feature, currentPlan) {
  const req = requiredPlanFor(feature);
  return {
    error: upgradeMessage(feature),
    code: 'PLAN_REQUIRED',
    upgrade_required: true,
    feature,
    current_plan: normalizePlan(currentPlan),
    required_plan: req,
    upgrade_url: upgradeUrlFor(feature),
  };
}

// ─── Marketing copy (Settings / upgrade page / landing / help) ───
// Only lists features that are actually built.
export const PLAN_MARKETING = {
  free: {
    id: 'free',
    name: 'Free',
    priceLabel: '$0',
    cadence: 'forever',
    tagline: 'Start quoting today',
    features: [
      '5 sent quotes per month',
      'Customers + aircraft history',
      'FAA tail-number lookup',
      'Quote builder with PDF + share link',
      'Public request link, QR code & embed + Requests inbox',
      'Public directory listing',
      '1 user',
      'Shiny Jets branding',
      '5% platform fee',
    ],
  },
  lite: {
    id: 'lite',
    name: 'Lite',
    priceLabel: '$39.95',
    cadence: '/mo',
    tagline: 'For the solo detailer',
    note: 'Included free with a quarterly Pricing Tool subscription',
    features: [
      'Everything in Free, plus:',
      'Unlimited quotes',
      'Quote follow-ups + scheduled send',
      'Google Calendar sync',
      'Invoices + Stripe payments, deposits, Book Now Pay Later',
      'Jobs with photos + completion/delivery reports',
      'Customer portal + live aircraft progress portal',
      'Detailing AI + AI quote drafts',
      'Review & feedback requests',
      'Your logo with “Powered by Shiny Jets”',
      '1 user',
      '2% platform fee',
    ],
  },
  business: {
    id: 'business',
    name: 'Business',
    priceLabel: '$89.95',
    cadence: '/mo',
    altPriceLabel: 'or $899/yr',
    tagline: 'For crews and growing shops',
    features: [
      'Everything in Lite, plus:',
      'Pricing Tool access included',
      'Up to 3 users: team roles & permissions, crew app, PIN time clock, payroll',
      'Dispatch board + manager dashboard',
      'Change orders',
      'Reports & profitability',
      'Recurring services',
      'Marketing campaigns',
      'Products, inventory & barcode scanning, equipment',
      'Full white-label + custom sending domain',
      'Top directory placement',
      '0% platform fee',
    ],
  },
};

// Keys to try (in order) when looking up per-plan rows in DB tables keyed by
// plan (e.g. plan_limits). The raw stored value comes first so legacy
// accounts keep their existing limits; new 'lite' falls back to the 'pro' row.
export function planLookupKeys(raw) {
  const r = String(raw || 'free').toLowerCase().trim();
  const n = normalizePlan(r);
  const keys = [r, n];
  for (const [legacy, target] of Object.entries(LEGACY_PLAN_ALIASES)) {
    if (target === n) keys.push(legacy);
  }
  return [...new Set(keys)];
}
