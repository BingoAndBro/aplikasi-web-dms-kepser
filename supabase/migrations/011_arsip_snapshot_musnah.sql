-- Migration: 011_arsip_snapshot_musnah.sql
-- Add lampiran_snapshot and musnah lifecycle metadata to arsip table
-- Update CHECK constraint to include DIMUSNAHKAN status

-- Add lampiran_snapshot column (JSON array, stores a copy of lampiran_urls at archive time)
ALTER TABLE arsip ADD COLUMN IF NOT EXISTS lampiran_snapshot jsonb;

-- Add musnah lifecycle columns
ALTER TABLE arsip ADD COLUMN IF NOT EXISTS musnah_at timestamptz;
ALTER TABLE arsip ADD COLUMN IF NOT EXISTS musnah_by uuid REFERENCES auth.users(id);
ALTER TABLE arsip ADD COLUMN IF NOT EXISTS musnah_catatan text;

-- Drop existing CHECK constraint and add updated version
DROP CONSTRAINT IF EXISTS arsip_status_arsip_check;
ALTER TABLE arsip ADD CONSTRAINT arsip_status_arsip_check
  CHECK (status_arsip IN ('AKTIF', 'INAKTIF', 'USUL_MUSNAH', 'DIMUSNAHKAN'));