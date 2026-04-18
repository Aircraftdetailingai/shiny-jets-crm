import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Get business insights for inventory and equipment
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || 'month'; // month, year, all

  // Calculate date range
  const now = new Date();
  let startDate;
  if (period === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1);
  } else {
    startDate = new Date('2020-01-01');
  }

  // Get products
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('detailer_id', user.id);

  // Get equipment
  const { data: equipment } = await supabase
    .from('equipment')
    .select('*')
    .eq('detailer_id', user.id);

  // Get product usage from job completion logs
  const { data: completionLogs } = await supabase
    .from('job_completion_logs')
    .select('product_cost, products_used, created_at')
    .eq('detailer_id', user.id)
    .gte('created_at', startDate.toISOString());

  // Get completed jobs for the period
  const { data: completedJobs } = await supabase
    .from('quotes')
    .select('id, total_price, product_cost')
    .eq('detailer_id', user.id)
    .in('status', ['completed', 'paid'])
    .gte('completed_at', startDate.toISOString());

  // Calculate material costs from logs
  const totalMaterialCost = (completionLogs || []).reduce((sum, log) =>
    sum + (log.product_cost || 0), 0
  );

  const jobCount = (completedJobs || []).length;
  const avgMaterialCostPerJob = jobCount > 0 ? totalMaterialCost / jobCount : 0;

  // Calculate total revenue
  const totalRevenue = (completedJobs || []).reduce((sum, job) =>
    sum + (job.total_price || 0), 0
  );

  // Calculate inventory value
  const inventoryValue = (products || []).reduce((sum, p) =>
    sum + ((p.quantity || 0) * (p.cost_per_unit || 0)), 0
  );

  // Find low stock items
  const lowStock = (products || []).filter(p =>
    p.reorder_level > 0 && p.quantity <= p.reorder_level
  );

  // Calculate equipment ROI
  const equipmentStats = (equipment || []).map(e => ({
    id: e.id,
    name: e.name,
    purchasePrice: e.purchase_price,
    jobsCompleted: e.jobs_completed,
    costPerJob: e.jobs_completed > 0 ? e.purchase_price / e.jobs_completed : null,
  })).sort((a, b) => (a.costPerJob || 999999) - (b.costPerJob || 999999));

  const totalEquipmentInvestment = (equipment || []).reduce((sum, e) =>
    sum + (e.purchase_price || 0), 0
  );

  const totalEquipmentJobs = (equipment || []).reduce((sum, e) =>
    sum + (e.jobs_completed || 0), 0
  );

  // Cost breakdown estimation
  // Typical breakdown: Labor 50-60%, Materials 20-30%, Overhead 15-25%
  const laborPercent = totalRevenue > 0 ? Math.round(((totalRevenue - totalMaterialCost) / totalRevenue) * 100 * 0.7) : 55;
  const materialsPercent = totalRevenue > 0 ? Math.round((totalMaterialCost / totalRevenue) * 100) : 25;
  const overheadPercent = 100 - laborPercent - materialsPercent;

  return Response.json({
    period,
    summary: {
      totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
      avgMaterialCostPerJob: Math.round(avgMaterialCostPerJob * 100) / 100,
      jobCount,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      inventoryValue: Math.round(inventoryValue * 100) / 100,
      totalEquipmentInvestment: Math.round(totalEquipmentInvestment * 100) / 100,
    },
    costBreakdown: {
      labor: laborPercent,
      materials: materialsPercent,
      overhead: overheadPercent,
    },
    lowStock: lowStock.map(p => ({
      id: p.id,
      name: p.name,
      currentQuantity: p.quantity,
      reorderThreshold: p.reorder_level,
      unit: p.unit,
    })),
    equipmentROI: equipmentStats.slice(0, 5), // Top 5 by cost per job
    alerts: [
      ...lowStock.map(p => ({
        type: 'low_stock',
        message: `${p.name} inventory low: ${p.quantity} ${p.unit} remaining`,
        severity: p.quantity === 0 ? 'critical' : 'warning',
      })),
      ...(avgMaterialCostPerJob > 150 ? [{
        type: 'high_material_cost',
        message: `High material cost per job: $${avgMaterialCostPerJob.toFixed(0)}`,
        severity: 'info',
      }] : []),
    ],
  });
}
