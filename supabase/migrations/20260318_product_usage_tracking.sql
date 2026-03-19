-- Product usage log table
CREATE TABLE IF NOT EXISTS product_usage_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  detailer_id UUID REFERENCES detailers(id),
  job_id UUID REFERENCES quotes(id),
  product_id UUID REFERENCES products(id),
  service_id UUID REFERENCES services(id),
  aircraft_make TEXT,
  aircraft_model TEXT,
  aircraft_category TEXT,
  quantity_used DECIMAL(10,2),
  unit TEXT,
  logged_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product consumption averages table
CREATE TABLE IF NOT EXISTS product_consumption_averages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  detailer_id UUID REFERENCES detailers(id),
  product_id UUID REFERENCES products(id),
  service_id UUID REFERENCES services(id),
  aircraft_category TEXT,
  avg_quantity DECIMAL(10,2),
  sample_count INT DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(detailer_id, product_id, service_id, aircraft_category)
);

-- Network averages (aggregated across all detailers)
CREATE TABLE IF NOT EXISTS network_consumption_averages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_name TEXT,
  product_category TEXT,
  service_name TEXT,
  aircraft_category TEXT,
  avg_quantity DECIMAL(10,2),
  sample_count INT DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_name, product_category, service_name, aircraft_category)
);

-- RLS policies
ALTER TABLE product_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_consumption_averages ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_consumption_averages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON product_usage_log FOR ALL USING (true);
CREATE POLICY "service_role_all" ON product_consumption_averages FOR ALL USING (true);
CREATE POLICY "service_role_all" ON network_consumption_averages FOR ALL USING (true);
