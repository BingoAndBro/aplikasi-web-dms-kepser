-- ============================================================
-- Migration: 006_klasifikasi_hierarchy.sql
-- Deskripsi: Add parent_id and kode columns for hierarchical klasifikasi
-- Dibuat: 2026-05-01 (SPEC 05 — Arsip Flow)
-- ============================================================

-- 1. Add columns to master_klasifikasi_arsip
ALTER TABLE master_klasifikasi_arsip
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES master_klasifikasi_arsip(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kode text;

COMMENT ON COLUMN master_klasifikasi_arsip.parent_id IS 'FK ke parent klasifikasi — NULL berarti root (induk)';
COMMENT ON COLUMN master_klasifikasi_arsip.kode IS 'Kode klasifikasi manual, e.g. 000, 100, SK, DL.001';

-- 2. Add unique constraint on kode (allow NULL for existing records, enforce unique for non-NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_master_klasifikasi_kode_unique
  ON master_klasifikasi_arsip(kode)
  WHERE kode IS NOT NULL;

-- 3. Add index for parent_id lookups
CREATE INDEX IF NOT EXISTS idx_master_klasifikasi_parent_id
  ON master_klasifikasi_arsip(parent_id)
  WHERE parent_id IS NOT NULL;

-- 4. Update existing seed data - add root "000 - Klasifikasi Induk"
INSERT INTO master_klasifikasi_arsip (nama, deskripsi, kode, parent_id, is_active)
VALUES ('Klasifikasi Induk', 'Root induk dari semua klasifikasi', '000', NULL, true)
ON CONFLICT (nama) DO NOTHING;

-- 5. Get root id and update existing klasifikasi to be children of root
DO $$
DECLARE
  root_id uuid;
BEGIN
  -- Get the root klasifikasi id
  SELECT id INTO root_id
  FROM master_klasifikasi_arsip
  WHERE nama = 'Klasifikasi Induk'
  AND kode = '000'
  LIMIT 1;

  -- Update existing klasifikasi to be children of root with sequential codes
  IF root_id IS NOT NULL THEN
    UPDATE master_klasifikasi_arsip
    SET parent_id = root_id,
        kode = CASE nama
          WHEN 'Klasifikasi I' THEN '100'
          WHEN 'Klasifikasi II' THEN '200'
          WHEN 'Klasifikasi III' THEN '300'
          WHEN 'Klasifikasi IV' THEN '400'
          WHEN 'Klasifikasi V' THEN '500'
          WHEN 'Klasifikasi VI' THEN '600'
          WHEN 'Klasifikasi VII' THEN '700'
          ELSE '999'
        END
    WHERE parent_id IS NULL
    AND nama IN ('Klasifikasi I', 'Klasifikasi II', 'Klasifikasi III',
                 'Klasifikasi IV', 'Klasifikasi V', 'Klasifikasi VI', 'Klasifikasi VII');
  END IF;
END $$;

-- 6. Seed additional example hierarchy (optional - can be removed in production)
INSERT INTO master_klasifikasi_arsip (nama, deskripsi, kode, parent_id, is_active)
SELECT
  sub.nama,
  sub.deskripsi,
  sub.kode,
  root.id,
  true
FROM (
  VALUES
    ('SK', 'Surat Keputusan', 'SK', 'Klasifikasi Induk'::text),
    ('DL', 'Diklat', 'DL', 'Klasifikasi Induk'::text)
) AS sub(nama, deskripsi, kode, parent_nama)
CROSS JOIN (
  SELECT id FROM master_klasifikasi_arsip WHERE nama = 'Klasifikasi Induk' LIMIT 1
) AS root
WHERE NOT EXISTS (
  SELECT 1 FROM master_klasifikasi_arsip WHERE nama = sub.nama
);