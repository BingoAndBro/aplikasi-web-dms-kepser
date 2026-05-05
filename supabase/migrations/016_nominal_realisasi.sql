-- ============================================================
-- Migration: 016_nominal_realisasi.sql
-- Deskripsi: Add nominal_realisasi dan is_non_material columns
-- Dibuat: 2026-05-04
-- Bergantung pada: -
--============================================================

-- Tambah kolom ke dokumen_transaksi
ALTER TABLE dokumen_transaksi
  ADD COLUMN IF NOT EXISTS nominal_realisasi DECIMAL(15,2) DEFAULT 0;

ALTER TABLE dokumen_transaksi
  ADD COLUMN IF NOT EXISTS is_non_material BOOLEAN DEFAULT false;

-- Tambah kolom ke arsip
ALTER TABLE arsip
  ADD COLUMN IF NOT EXISTS nominal_realisasi DECIMAL(15,2);

-- Constraint untuk ensure nominal >= 0 (opsional, tapi recommended)
ALTER TABLE dokumen_transaksi
  ADD CONSTRAINT dokumen_nominal_realisasi_positive
  CHECK (nominal_realisasi IS NULL OR nominal_realisasi >= 0);