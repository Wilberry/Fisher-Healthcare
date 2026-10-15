-- Synthetic, non-clinical fixture records for isolated development only.
-- This script does not insert genuine patient, laboratory, test or billing information.
INSERT INTO laboratories(id,name,active)
 VALUES ('00000000-0000-4000-8000-000000000101','Synthetic Laboratory — Training Only',false)
 ON CONFLICT (id) DO NOTHING;
INSERT INTO tests(id,code,name,specimen_type,active)
 VALUES ('00000000-0000-4000-8000-000000000102','SYNTHETIC-FOUNDATION','Synthetic Test — Not Clinically Valid','synthetic',false)
 ON CONFLICT (id) DO NOTHING;
