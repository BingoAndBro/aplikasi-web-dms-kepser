-- ============================================================
-- Migration: 009_fix_arsip_status.sql
-- Fix: Add USUL_MUSNAH to arsip status_arsip CHECK constraint
-- ============================================================

-- Drop existing constraint and re-add with all states
ALTER TABLE arsip DROP CONSTRAINT IF EXISTS arsip_status_arsip_check;
ALTER TABLE arsip ADD CONSTRAINT arsip_status_arsip_check
  CHECK (status_arsip IN ('AKTIF', 'VERIFIKASI_PENYUSUTAN', 'INAKTIF', 'USUL_MUSNAH'));