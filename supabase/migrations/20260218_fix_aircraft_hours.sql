-- RUN THIS IN SUPABASE DASHBOARD > SQL EDITOR
-- Fixes column precision and updates Gulfstream G650-G800 hours

-- Step 1: Fix column precision (current DECIMAL(4,2) maxes at 99.99)
ALTER TABLE aircraft ALTER COLUMN ext_wash_hours TYPE DECIMAL(8,2);
ALTER TABLE aircraft ALTER COLUMN int_detail_hours TYPE DECIMAL(8,2);
ALTER TABLE aircraft ALTER COLUMN leather_hours TYPE DECIMAL(8,2);
ALTER TABLE aircraft ALTER COLUMN carpet_hours TYPE DECIMAL(8,2);
ALTER TABLE aircraft ALTER COLUMN wax_hours TYPE DECIMAL(8,2);
ALTER TABLE aircraft ALTER COLUMN polish_hours TYPE DECIMAL(8,2);
ALTER TABLE aircraft ALTER COLUMN ceramic_hours TYPE DECIMAL(8,2);
ALTER TABLE aircraft ALTER COLUMN brightwork_hours TYPE DECIMAL(8,2);

-- Step 2: Add new columns for Decon and Spray Ceramic services
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS decon_hours DECIMAL(8,2) DEFAULT 0;
ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS spray_ceramic_hours DECIMAL(8,2) DEFAULT 0;

-- Step 3: Update G650, G650ER, G700, G800 (failed due to overflow)
UPDATE aircraft SET ext_wash_hours=23.08, decon_hours=23.68, polish_hours=104.21, wax_hours=36.84, spray_ceramic_hours=41.58, ceramic_hours=10.29, brightwork_hours=31.58, leather_hours=6.32, carpet_hours=2.53 WHERE manufacturer='Gulfstream' AND model='G650';
UPDATE aircraft SET ext_wash_hours=23.08, decon_hours=23.68, polish_hours=104.21, wax_hours=36.84, spray_ceramic_hours=41.58, ceramic_hours=10.29, brightwork_hours=31.58, leather_hours=6.32, carpet_hours=2.53 WHERE manufacturer='Gulfstream' AND model='G650ER';
UPDATE aircraft SET ext_wash_hours=26.15, decon_hours=26.84, polish_hours=118.42, wax_hours=41.58, spray_ceramic_hours=47.37, ceramic_hours=11.71, brightwork_hours=32.63, leather_hours=6.32, carpet_hours=2.79 WHERE manufacturer='Gulfstream' AND model='G700';
UPDATE aircraft SET ext_wash_hours=23.85, decon_hours=24.74, polish_hours=107.37, wax_hours=37.89, spray_ceramic_hours=43.16, ceramic_hours=10.63, brightwork_hours=32.63, leather_hours=6.32, carpet_hours=2.53 WHERE manufacturer='Gulfstream' AND model='G800';

-- Step 4: Update decon_hours and spray_ceramic_hours for G280-G600 (updated via API but missing new columns)
UPDATE aircraft SET decon_hours=10.53, spray_ceramic_hours=17.89 WHERE manufacturer='Gulfstream' AND model='G280';
UPDATE aircraft SET decon_hours=16.84, spray_ceramic_hours=29.47 WHERE manufacturer='Gulfstream' AND model='G450';
UPDATE aircraft SET decon_hours=19.42, spray_ceramic_hours=33.58 WHERE manufacturer='Gulfstream' AND model='G500';
UPDATE aircraft SET decon_hours=22.11, spray_ceramic_hours=38.42 WHERE manufacturer='Gulfstream' AND model='G550';
UPDATE aircraft SET decon_hours=22.16, spray_ceramic_hours=38.63 WHERE manufacturer='Gulfstream' AND model='G600';

-- Step 5: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Verify
SELECT model, ext_wash_hours, decon_hours, polish_hours, wax_hours, spray_ceramic_hours, ceramic_hours, brightwork_hours, leather_hours, carpet_hours
FROM aircraft WHERE manufacturer = 'Gulfstream' ORDER BY model;
