-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('terms', 'terms', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('reward-images', 'reward-images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('aircraft-photos', 'aircraft-photos', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('equipment-images', 'equipment-images', true) ON CONFLICT DO NOTHING;

-- Public read policies for public buckets
CREATE POLICY IF NOT EXISTS "Public read logos" ON storage.objects FOR SELECT USING (bucket_id = 'logos');
CREATE POLICY IF NOT EXISTS "Public read aircraft-photos" ON storage.objects FOR SELECT USING (bucket_id = 'aircraft-photos');
CREATE POLICY IF NOT EXISTS "Public read product-images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY IF NOT EXISTS "Public read equipment-images" ON storage.objects FOR SELECT USING (bucket_id = 'equipment-images');
CREATE POLICY IF NOT EXISTS "Public read reward-images" ON storage.objects FOR SELECT USING (bucket_id = 'reward-images');
CREATE POLICY IF NOT EXISTS "Public read terms" ON storage.objects FOR SELECT USING (bucket_id = 'terms');

-- Owner read for private documents bucket
CREATE POLICY IF NOT EXISTS "Owner read documents" ON storage.objects FOR SELECT USING (bucket_id = 'documents' AND auth.role() = 'authenticated');

-- Auth upload policies
CREATE POLICY IF NOT EXISTS "Auth upload logos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'logos' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth upload aircraft-photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'aircraft-photos' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth upload product-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth upload equipment-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'equipment-images' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth upload reward-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'reward-images' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth upload terms" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'terms' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth upload documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'documents' AND auth.role() = 'authenticated');

-- Auth update policies
CREATE POLICY IF NOT EXISTS "Auth update logos" ON storage.objects FOR UPDATE USING (bucket_id = 'logos' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth update aircraft-photos" ON storage.objects FOR UPDATE USING (bucket_id = 'aircraft-photos' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth update product-images" ON storage.objects FOR UPDATE USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth update equipment-images" ON storage.objects FOR UPDATE USING (bucket_id = 'equipment-images' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth update reward-images" ON storage.objects FOR UPDATE USING (bucket_id = 'reward-images' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth update terms" ON storage.objects FOR UPDATE USING (bucket_id = 'terms' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth update documents" ON storage.objects FOR UPDATE USING (bucket_id = 'documents' AND auth.role() = 'authenticated');

-- Auth delete policies
CREATE POLICY IF NOT EXISTS "Auth delete logos" ON storage.objects FOR DELETE USING (bucket_id = 'logos' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth delete aircraft-photos" ON storage.objects FOR DELETE USING (bucket_id = 'aircraft-photos' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth delete product-images" ON storage.objects FOR DELETE USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth delete equipment-images" ON storage.objects FOR DELETE USING (bucket_id = 'equipment-images' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth delete reward-images" ON storage.objects FOR DELETE USING (bucket_id = 'reward-images' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth delete terms" ON storage.objects FOR DELETE USING (bucket_id = 'terms' AND auth.role() = 'authenticated');
CREATE POLICY IF NOT EXISTS "Auth delete documents" ON storage.objects FOR DELETE USING (bucket_id = 'documents' AND auth.role() = 'authenticated');
