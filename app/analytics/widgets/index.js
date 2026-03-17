'use client';
import RevenueVelocity from './RevenueVelocity';
import QuoteFunnel from './QuoteFunnel';
import CashCollectedToday from './CashCollectedToday';
import LeadsToClose from './LeadsToClose';
import AverageTicket from './AverageTicket';
import RevenueByAircraft from './RevenueByAircraft';
import BusiestDaysHeatmap from './BusiestDaysHeatmap';
import TopServicesMargin from './TopServicesMargin';
import CustomerLTV from './CustomerLTV';
import ChurnRisk from './ChurnRisk';
import MRRTrend from './MRRTrend';
import StaffingAlerts from './StaffingAlerts';

export {
  RevenueVelocity, QuoteFunnel, CashCollectedToday, LeadsToClose,
  AverageTicket, RevenueByAircraft, BusiestDaysHeatmap, TopServicesMargin,
  CustomerLTV, ChurnRisk, MRRTrend, StaffingAlerts,
};

export const WIDGET_COMPONENTS = {
  'revenue-velocity': RevenueVelocity,
  'quote-funnel': QuoteFunnel,
  'cash-collected-today': CashCollectedToday,
  'leads-to-close': LeadsToClose,
  'average-ticket': AverageTicket,
  'revenue-by-aircraft': RevenueByAircraft,
  'busiest-days-heatmap': BusiestDaysHeatmap,
  'top-services-margin': TopServicesMargin,
  'customer-ltv': CustomerLTV,
  'churn-risk': ChurnRisk,
  'mrr-trend': MRRTrend,
  'staffing-alerts': StaffingAlerts,
};
