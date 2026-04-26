-- ============================================================
-- Migration: 010_drop_verifikasi_penyusutan.sql
-- Hapus verifikasi penyusutan — perpindahan AKTIF→INAKTIF langsung manual
-- Dibuat: 2026-04-25
-- ============================================================

-- 1. Drop tabel verifikasi penyusutan (CASCADE menghapus RLS policies)
DROP TABLE IF EXISTS arsip_verifikasi_penyusutan CASCADE;

-- 2. Update CHECK constraint arsip — hapus VERIFIKASI_PENYUSUTAN
ALTER TABLE arsip DROP CONSTRAINT IF EXISTS arsip_status_arsip_check;
ALTER TABLE arsip ADD CONSTRAINT arsip_status_arsip_check
  CHECK (status_arsip IN ('AKTIF', 'INAKTIF', 'USUL_MUSNAH'));
