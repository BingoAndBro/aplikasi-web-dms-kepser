-- =====================================================
-- 006_jenis_kategori_detail.sql
-- Jenis / Kategori / Detail Permintaan + extend kelengkapan chain
-- Idempotent — aman dijalankan lebih dari sekali
-- =====================================================

-- =====================================================
-- TABLE: master_jenis_permintaan (BEBAS — tidak bergantung ke apapun)
-- =====================================================
CREATE TABLE IF NOT EXISTS master_jenis_permintaan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL,
  deskripsi text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- =====================================================
-- TABLE: master_kategori_permintaan (bergantung ke jenis_permintaan)
-- =====================================================
CREATE TABLE IF NOT EXISTS master_kategori_permintaan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jenis_permintaan_id uuid NOT NULL REFERENCES master_jenis_permintaan(id) ON DELETE RESTRICT,
  nama text NOT NULL,
  deskripsi text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- =====================================================
-- TABLE: master_detail_permintaan (bergantung ke kategori — OPSIONAL)
-- Beberapa kategori tidak punya detail anak
-- =====================================================
CREATE TABLE IF NOT EXISTS master_detail_permintaan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kategori_permintaan_id uuid NOT NULL REFERENCES master_kategori_permintaan(id) ON DELETE RESTRICT,
  nama text NOT NULL,
  deskripsi text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- =====================================================
-- EXTEND: master_kelengkapan_dokumen — nullable chain columns
-- NULL = wildcard (match semua). Backward compatible.
-- =====================================================
ALTER TABLE master_kelengkapan_dokumen
  ADD COLUMN IF NOT EXISTS jenis_permintaan_id uuid,
  ADD COLUMN IF NOT EXISTS kategori_permintaan_id uuid,
  ADD COLUMN IF NOT EXISTS detail_permintaan_id uuid;

-- =====================================================
-- EXTEND: dokumen_transaksi — simpan chain saat submit
-- =====================================================
ALTER TABLE dokumen_transaksi
  ADD COLUMN IF NOT EXISTS jenis_permintaan_id uuid,
  ADD COLUMN IF NOT EXISTS kategori_permintaan_id uuid,
  ADD COLUMN IF NOT EXISTS detail_permintaan_id uuid;

-- =====================================================
-- INDEXES: performa query
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_jenis_is_active ON master_jenis_permintaan(is_active);
CREATE INDEX IF NOT EXISTS idx_kategori_jenis ON master_kategori_permintaan(jenis_permintaan_id, is_active);
CREATE INDEX IF NOT EXISTS idx_detail_kategori ON master_detail_permintaan(kategori_permintaan_id, is_active);
CREATE INDEX IF NOT EXISTS idx_kelengkapan_chain ON master_kelengkapan_dokumen(kegiatan_id, is_ketua_tim, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id);

-- =====================================================
-- RLS: master_jenis_permintaan
-- =====================================================
ALTER TABLE master_jenis_permintaan ENABLE ROW LEVEL SECURITY;

CREATE POLICY jenis_select ON master_jenis_permintaan
  FOR SELECT USING (true);

CREATE POLICY jenis_admin_all ON master_jenis_permintaan
  FOR ALL USING (EXISTS (
    SELECT 1 FROM get_user_roles(auth.uid()) gr WHERE gr.nama = 'ADMIN'
  ));

-- =====================================================
-- RLS: master_kategori_permintaan
-- =====================================================
ALTER TABLE master_kategori_permintaan ENABLE ROW LEVEL SECURITY;

CREATE POLICY kategori_select ON master_kategori_permintaan
  FOR SELECT USING (true);

CREATE POLICY kategori_admin_all ON master_kategori_permintaan
  FOR ALL USING (EXISTS (
    SELECT 1 FROM get_user_roles(auth.uid()) gr WHERE gr.nama = 'ADMIN'
  ));

-- =====================================================
-- RLS: master_detail_permintaan
-- =====================================================
ALTER TABLE master_detail_permintaan ENABLE ROW LEVEL SECURITY;

CREATE POLICY detail_select ON master_detail_permintaan
  FOR SELECT USING (true);

CREATE POLICY detail_admin_all ON master_detail_permintaan
  FOR ALL USING (EXISTS (
    SELECT 1 FROM get_user_roles(auth.uid()) gr WHERE gr.nama = 'ADMIN'
  ));

-- =====================================================
-- SEED DATA: master_jenis_permintaan
-- =====================================================
INSERT INTO master_jenis_permintaan (nama, deskripsi) VALUES
  ('Perjalanan Dinas', 'SPPD / Surat Perintah Perjalanan Dinas'),
  ('Honorarium', 'Pembayaran honorium narasumber, enumerator, dan sejenisnya'),
  ('Translok', 'Biaya transport lokal / translok harian')
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED DATA: master_kategori_permintaan
-- =====================================================

-- Perjalanan Dinas
INSERT INTO master_kategori_permintaan (jenis_permintaan_id, nama, deskripsi)
SELECT id, 'Translok', 'Biaya translok perjalanan dinas'
FROM master_jenis_permintaan WHERE nama = 'Perjalanan Dinas'
ON CONFLICT DO NOTHING;
INSERT INTO master_kategori_permintaan (jenis_permintaan_id, nama, deskripsi)
SELECT id, 'Perjadin ke Pulau', 'Perjalanan dinas ke pulau-pulau terpencil'
FROM master_jenis_permintaan WHERE nama = 'Perjalanan Dinas'
ON CONFLICT DO NOTHING;
INSERT INTO master_kategori_permintaan (jenis_permintaan_id, nama, deskripsi)
SELECT id, 'Uang Harian', 'Uang harian perjalanan dinas'
FROM master_jenis_permintaan WHERE nama = 'Perjalanan Dinas'
ON CONFLICT DO NOTHING;

-- Honorarium
INSERT INTO master_kategori_permintaan (jenis_permintaan_id, nama, deskripsi)
SELECT id, 'Narasumber', 'Honorarium narasumber atau pemateri'
FROM master_jenis_permintaan WHERE nama = 'Honorarium'
ON CONFLICT DO NOTHING;
INSERT INTO master_kategori_permintaan (jenis_permintaan_id, nama, deskripsi)
SELECT id, 'Enumerator', 'Honorarium enumerator lapangan'
FROM master_jenis_permintaan WHERE nama = 'Honorarium'
ON CONFLICT DO NOTHING;
INSERT INTO master_kategori_permintaan (jenis_permintaan_id, nama, deskripsi)
SELECT id, 'Koordinator Lapangan', 'Honorarium koordinator lapangan'
FROM master_jenis_permintaan WHERE nama = 'Honorarium'
ON CONFLICT DO NOTHING;

-- Translok
INSERT INTO master_kategori_permintaan (jenis_permintaan_id, nama, deskripsi)
SELECT id, 'Translok Biasa', 'Translok harian tanpa durasi khusus'
FROM master_jenis_permintaan WHERE nama = 'Translok'
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED DATA: master_detail_permintaan (OPSIONAL — tidak semua kategori punya)
-- Hanya Translok / Translok Biasa yang punya detail
-- =====================================================
INSERT INTO master_detail_permintaan (kategori_permintaan_id, nama, deskripsi)
SELECT id, 'Translok Biasa', 'Translok standar <= 8 jam'
FROM master_kategori_permintaan WHERE nama = 'Translok Biasa'
ON CONFLICT DO NOTHING;
INSERT INTO master_detail_permintaan (kategori_permintaan_id, nama, deskripsi)
SELECT id, 'Translok > 8 Jam', 'Translok lembur lebih dari 8 jam'
FROM master_kategori_permintaan WHERE nama = 'Translok Biasa'
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED DATA: master_kelengkapan_dokumen — kelengkapan chain contoh
-- SAKERNAS + Perjalanan Dinas + Translok + Translok Biasa
-- =====================================================

-- Ketua Tim
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, true, 'Surat Tugas', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok Biasa' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, true, 'KAK (Kerangka Acuan Kerja)', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok Biasa' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, true, 'Proposal Kegiatan', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok Biasa' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, true, 'Form Permintaan', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok Biasa' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, true, 'Surat Keterangan Kendaraan Dinas', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok Biasa' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, true, 'Laporan Pertanggungjawaban', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok Biasa' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;

-- Anggota
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, false, 'Surat Tugas', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok Biasa' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, false, 'KAK (Kerangka Acuan Kerja)', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok Biasa' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, false, 'Laporan Pelaksanaan', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok Biasa' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;

-- SAKERNAS + Perjalanan Dinas + Translok + Translok > 8 Jam (Ketua Tim)
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, true, 'Surat Tugas', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok > 8 Jam' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, true, 'KAK (Kerangka Acuan Kerja)', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok > 8 Jam' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, true, 'Proposal Kegiatan', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok > 8 Jam' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, true, 'Form Permintaan', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok > 8 Jam' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, true, 'Surat Keterangan Kendaraan Dinas', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok > 8 Jam' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, true, 'Laporan Pertanggungjawaban', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok > 8 Jam' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;

-- Anggota (Translok > 8 Jam)
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, false, 'Surat Tugas', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok > 8 Jam' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, false, 'KAK (Kerangka Acuan Kerja)', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok > 8 Jam' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, d.id, false, 'Laporan Pelaksanaan', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka, master_detail_permintaan d
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Translok' AND ka.jenis_permintaan_id = j.id
  AND d.nama = 'Translok > 8 Jam' AND d.kategori_permintaan_id = ka.id
ON CONFLICT DO NOTHING;

-- SAKERNAS + Perjalanan Dinas + Perjadin ke Pulau (TIDAK ada detail)
-- Ini kelengkapan tanpa detail — detail_permintaan_id NULL
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, NULL, true, 'Surat Tugas', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Perjadin ke Pulau' AND ka.jenis_permintaan_id = j.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, NULL, true, 'KAK (Kerangka Acuan Kerja)', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Perjadin ke Pulau' AND ka.jenis_permintaan_id = j.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, NULL, true, 'Proposal Kegiatan', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Perjadin ke Pulau' AND ka.jenis_permintaan_id = j.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, NULL, true, 'Form Permintaan', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Perjadin ke Pulau' AND ka.jenis_permintaan_id = j.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, NULL, true, 'Surat Keterangan Kendaraan Dinas', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Perjadin ke Pulau' AND ka.jenis_permintaan_id = j.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, NULL, true, 'Laporan Pertanggungjawaban', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Perjadin ke Pulau' AND ka.jenis_permintaan_id = j.id
ON CONFLICT DO NOTHING;

-- Anggota (Perjadin ke Pulau)
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, NULL, false, 'Surat Tugas', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Perjadin ke Pulau' AND ka.jenis_permintaan_id = j.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, NULL, false, 'KAK (Kerangka Acuan Kerja)', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Perjadin ke Pulau' AND ka.jenis_permintaan_id = j.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, NULL, false, 'Laporan Pelaksanaan', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Perjalanan Dinas'
  AND ka.nama = 'Perjadin ke Pulau' AND ka.jenis_permintaan_id = j.id
ON CONFLICT DO NOTHING;

-- SAKERNAS + Honorarium + Narasumber (TIDAK ada detail)
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, NULL, true, 'Surat Tugas', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Honorarium'
  AND ka.nama = 'Narasumber' AND ka.jenis_permintaan_id = j.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, NULL, true, 'Honorarium Narasumber', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Honorarium'
  AND ka.nama = 'Narasumber' AND ka.jenis_permintaan_id = j.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, NULL, true, 'KAK (Kerangka Acuan Kerja)', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Honorarium'
  AND ka.nama = 'Narasumber' AND ka.jenis_permintaan_id = j.id
ON CONFLICT DO NOTHING;

INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, NULL, false, 'Surat Tugas', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Honorarium'
  AND ka.nama = 'Narasumber' AND ka.jenis_permintaan_id = j.id
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id, is_ketua_tim, nama_dokumen, required)
SELECT k.id, j.id, ka.id, NULL, false, 'Honorarium Narasumber', true
FROM master_kegiatan k, master_jenis_permintaan j, master_kategori_permintaan ka
WHERE k.nama = 'SAKERNAS' AND j.nama = 'Honorarium'
  AND ka.nama = 'Narasumber' AND ka.jenis_permintaan_id = j.id
ON CONFLICT DO NOTHING;
