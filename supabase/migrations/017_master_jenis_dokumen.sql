-- ============================================================
-- Migration: 017_master_jenis_dokumen.sql
-- Deskripsi: Add master jenis dokumen for Non-Material documents
-- Dibuat: 2026-05-04
--============================================================

-- Tabel master jenis dokumen (untuk dokumen Non-Material)
CREATE TABLE IF NOT EXISTS master_jenis_dokumen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama VARCHAR(255) NOT NULL,
  deskripsi TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Insert default jenis dokumen
INSERT INTO master_jenis_dokumen (nama, deskripsi) VALUES
  ('Rapat', 'Dokumen terkait kegiatan rapat'),
  ('Kunjungan', 'Dokumen terkait kunjungan/studi banding'),
  ('Pelatihan', 'Dokumen terkait pelatihan/sosialisasi'),
  ('Seminar', 'Dokumen terkait seminar/workshop'),
  ('Survey', 'Dokumen terkait survey/laporan'),
  ('Lainnya', 'Jenis dokumen lainnya')
ON CONFLICT DO NOTHING;

-- Tambah kolom keterangan_detail untuk dokumen Non-Material
ALTER TABLE dokumen_transaksi
  ADD COLUMN IF NOT EXISTS keterangan_detail TEXT;

-- Tambah kolom jenis_dokumen_id untuk dokumen Non-Material
ALTER TABLE dokumen_transaksi
  ADD COLUMN IF NOT EXISTS jenis_dokumen_id UUID REFERENCES master_jenis_dokumen(id);

-- ============================================================
-- Row Level Security for master_jenis_dokumen
-- ============================================================

-- Enable RLS
ALTER TABLE master_jenis_dokumen ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read aktif jenis dokumen
CREATE POLICY "Allow read aktif jenis dokumen"
  ON master_jenis_dokumen
  FOR SELECT
  USING (is_active = true);

-- Policy: Only ADMIN role can insert/update/delete
CREATE POLICY "ADMIN can manage jenis dokumen"
  ON master_jenis_dokumen
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT user_id FROM user_roles
      WHERE role_id IN (
        SELECT id FROM roles WHERE nama IN ('ADMIN', 'SUPERADMIN')
      )
    )
  );