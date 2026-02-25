// Role definitions and default permissions

export const ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'manager', label: 'Manager' },
  { value: 'lead_tech', label: 'Lead Tech' },
  { value: 'employee', label: 'Employee' },
  { value: 'contractor', label: 'Contractor' },
];

export const PERMISSION_LABELS = {
  can_see_customer_contact: 'View Customer Contact Info',
  can_see_aircraft_owner: 'View Aircraft Owner',
  can_see_pricing: 'View Pricing & Quotes',
  can_see_equipment_cost: 'View Equipment Costs',
  can_see_inventory: 'View Inventory',
  can_upload_photos: 'Upload Job Photos',
  can_see_dashboard: 'View Dashboard & Analytics',
  schedule_visibility_days: 'Schedule Visibility',
};

export const PERMISSION_DESCRIPTIONS = {
  can_see_customer_contact: 'Name, email, and phone of customers',
  can_see_aircraft_owner: 'Aircraft owner and registration details',
  can_see_pricing: 'Quote totals, line item pricing, revenue',
  can_see_equipment_cost: 'Equipment purchase prices and costs',
  can_see_inventory: 'Product inventory and stock levels',
  can_upload_photos: 'Upload before/after photos for jobs',
  can_see_dashboard: 'Access the main dashboard and analytics',
  schedule_visibility_days: 'How far ahead they can see scheduled jobs',
};

export const SCHEDULE_OPTIONS = [
  { value: 0, label: 'Today only' },
  { value: 7, label: '1 week' },
  { value: 30, label: '1 month' },
  { value: -1, label: 'All (unlimited)' },
];

export const DEFAULT_PERMISSIONS = {
  owner: {
    can_see_customer_contact: true,
    can_see_aircraft_owner: true,
    can_see_pricing: true,
    can_see_equipment_cost: true,
    can_see_inventory: true,
    can_upload_photos: true,
    can_see_dashboard: true,
    schedule_visibility_days: -1,
  },
  manager: {
    can_see_customer_contact: true,
    can_see_aircraft_owner: true,
    can_see_pricing: true,
    can_see_equipment_cost: false,
    can_see_inventory: true,
    can_upload_photos: true,
    can_see_dashboard: true,
    schedule_visibility_days: -1,
  },
  lead_tech: {
    can_see_customer_contact: true,
    can_see_aircraft_owner: true,
    can_see_pricing: false,
    can_see_equipment_cost: false,
    can_see_inventory: true,
    can_upload_photos: true,
    can_see_dashboard: false,
    schedule_visibility_days: 7,
  },
  employee: {
    can_see_customer_contact: false,
    can_see_aircraft_owner: false,
    can_see_pricing: false,
    can_see_equipment_cost: false,
    can_see_inventory: false,
    can_upload_photos: true,
    can_see_dashboard: false,
    schedule_visibility_days: 0,
  },
  contractor: {
    can_see_customer_contact: false,
    can_see_aircraft_owner: false,
    can_see_pricing: false,
    can_see_equipment_cost: false,
    can_see_inventory: false,
    can_upload_photos: true,
    can_see_dashboard: false,
    schedule_visibility_days: 0,
  },
};

/**
 * Get effective permissions for a role, merging defaults with custom overrides.
 */
export function getPermissionsForRole(role, customPermissions) {
  const defaults = DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.employee;
  if (!customPermissions || !customPermissions[role]) return { ...defaults };
  return { ...defaults, ...customPermissions[role] };
}
