-- =====================================================
-- 002_master_data.sql
-- Master Data Management: fungsi, kegiatan, kelengkapan
-- Idempotent — aman dijalankan lebih dari sekali
-- =====================================================

-- =====================================================
-- TABLE: master_fungsi (departemen/fungsi BPS)
-- =====================================================
CREATE TABLE IF NOT EXISTS master_fungsi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL UNIQUE,
  deskripsi text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- =====================================================
-- TABLE: master_kegiatan (jenis kegiatan per fungsi)
-- =====================================================
CREATE TABLE IF NOT EXISTS master_kegiatan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fungsi_id uuid NOT NULL REFERENCES master_fungsi(id) ON DELETE RESTRICT,
  nama text NOT NULL,
  deskripsi text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- =====================================================
-- TABLE: master_kelengkapan_dokumen (dokumen wajib × kegiatan × role)
-- =====================================================
CREATE TABLE IF NOT EXISTS master_kelengkapan_dokumen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kegiatan_id uuid NOT NULL REFERENCES master_kegiatan(id) ON DELETE CASCADE,
  is_ketua_tim boolean NOT NULL,
  nama_dokumen text NOT NULL,
  required boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- =====================================================
-- INDEXES: untuk performa query
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_master_fungsi_is_active ON master_fungsi(is_active);
CREATE INDEX IF NOT EXISTS idx_master_kegiatan_fungsi_id ON master_kegiatan(fungsi_id);
CREATE INDEX IF NOT EXISTS idx_master_kegiatan_is_active ON master_kegiatan(is_active);
CREATE INDEX IF NOT EXISTS idx_master_kelengkapan_kegiatan_id ON master_kelengkapan_dokumen(kegiatan_id);
CREATE INDEX IF NOT EXISTS idx_master_kelengkapan_is_ketua_tim ON master_kelengkapan_dokumen(is_ketua_tim);

-- =====================================================
-- RLS: master_fungsi
-- =====================================================
ALTER TABLE master_fungsi ENABLE ROW LEVEL SECURITY;

-- Semua authenticated user bisa SELECT (untuk dropdown)
CREATE POLICY master_fungsi_select ON master_fungsi
  FOR SELECT
  USING (true);

-- ADMIN only for mutations
CREATE POLICY master_fungsi_admin_all ON master_fungsi
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM get_user_roles(auth.uid()) gr
    WHERE gr.nama = 'ADMIN'
  ));

-- =====================================================
-- RLS: master_kegiatan
-- =====================================================
ALTER TABLE master_kegiatan ENABLE ROW LEVEL SECURITY;

CREATE POLICY master_kegiatan_select ON master_kegiatan
  FOR SELECT
  USING (true);

CREATE POLICY master_kegiatan_admin_all ON master_kegiatan
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM get_user_roles(auth.uid()) gr
    WHERE gr.nama = 'ADMIN'
  ));

-- =====================================================
-- RLS: master_kelengkapan_dokumen
-- =====================================================
ALTER TABLE master_kelengkapan_dokumen ENABLE ROW LEVEL SECURITY;

CREATE POLICY master_kelengkapan_select ON master_kelengkapan_dokumen
  FOR SELECT
  USING (true);

CREATE POLICY master_kelengkapan_admin_all ON master_kelengkapan_dokumen
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM get_user_roles(auth.uid()) gr
    WHERE gr.nama = 'ADMIN'
  ));

-- =====================================================
-- SEED DATA: 6 Fungsi BPS
-- Idempotent
-- =====================================================
INSERT INTO master_fungsi (nama, deskripsi) VALUES
  ('Sosial', 'Bidang Sosial — statistik kependudukan, kemiskinan, dan kesejahteraan sosial'),
  ('Distribusi', 'Bidang Distribusi — statistik perdagangan, harga, dan konsumsi'),
  ('Neraca', 'Bidang Neraca — neraca neraca daerah, lingkungan, dan pariwisata'),
  ('Produksi', 'Bidang Produksi — statistik pertanian, industri, dan pertambangan'),
  ('Umum', 'Bidang Umum — administrasi perkantoran, kepegawaian, dan keuangan'),
  ('IPDS', 'Bidang IPDS — integrasi pengolahan data dan sistem informasi statistik')
ON CONFLICT (nama) DO NOTHING;

-- =====================================================
-- SEED DATA: Kegiatan per Fungsi
-- Idempotent
-- =====================================================
INSERT INTO master_kegiatan (fungsi_id, nama, deskripsi)
SELECT id, 'SAKERNAS', 'Survei Angkatan Kerja Nasional — pengukuran tingkat pengangguran dan kesempatan kerja' FROM master_fungsi WHERE nama = 'Sosial'
ON CONFLICT DO NOTHING;
INSERT INTO master_kegiatan (fungsi_id, nama, deskripsi)
SELECT id, 'SUSENAS', 'Survei Sosial Ekonomi Nasional — konsumsi, pengeluaran, dan pendapatan rumah tangga' FROM master_fungsi WHERE nama = 'Sosial'
ON CONFLICT DO NOTHING;
INSERT INTO master_kegiatan (fungsi_id, nama, deskripsi)
SELECT id, 'PODES', 'Potensi Desa — karakteristik wilayah, potensi ekonomi, dan sosial desa' FROM master_fungsi WHERE nama = 'Sosial'
ON CONFLICT DO NOTHING;
INSERT INTO master_kegiatan (fungsi_id, nama, deskripsi)
SELECT id, 'Survei Harga Konsumen', 'Pengumpulan data harga konsumen dari berbagai pasar di wilayah' FROM master_fungsi WHERE nama = 'Distribusi'
ON CONFLICT DO NOTHING;
INSERT INTO master_kegiatan (fungsi_id, nama, deskripsi)
SELECT id, 'Survei Perdagangan Luar Negeri', 'Statistik impor dan ekspor barang' FROM master_fungsi WHERE nama = 'Distribusi'
ON CONFLICT DO NOTHING;
INSERT INTO master_kegiatan (fungsi_id, nama, deskripsi)
SELECT id, 'Neraca Konsumsi Rumah Tangga', 'Penyusunan neraca sektor rumah tangga dan konsumsi' FROM master_fungsi WHERE nama = 'Neraca'
ON CONFLICT DO NOTHING;
INSERT INTO master_kegiatan (fungsi_id, nama, deskripsi)
SELECT id, 'Survei Produksi Tanaman Pangan', 'Pengumpulan data luas panen dan produksi tanaman pangan' FROM master_fungsi WHERE nama = 'Produksi'
ON CONFLICT DO NOTHING;
INSERT INTO master_kegiatan (fungsi_id, nama, deskripsi)
SELECT id, 'Administrasi Perkantoran', 'Kegiatan administrasi umum dan kepegawaian' FROM master_fungsi WHERE nama = 'Umum'
ON CONFLICT DO NOTHING;
INSERT INTO master_kegiatan (fungsi_id, nama, deskripsi)
SELECT id, 'Pengolahan Data Statistik', 'Entry, validasi, dan olah data survei/SE' FROM master_fungsi WHERE nama = 'IPDS'
ON CONFLICT DO NOTHING;
INSERT INTO master_kegiatan (fungsi_id, nama, deskripsi)
SELECT id, 'SEP', 'Survei Ekonomi Pertanian — karakteristik usahapertanian' FROM master_fungsi WHERE nama = 'Produksi'
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED DATA: Kelengkapan SAKERNAS (Ketua Tim)
-- Idempotent
-- =====================================================
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, is_ketua_tim, nama_dokumen, required)
SELECT id, true, 'Surat Tugas', true FROM master_kegiatan WHERE nama = 'SAKERNAS'
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, is_ketua_tim, nama_dokumen, required)
SELECT id, true, 'KAK (Kerangka Acuan Kerja)', true FROM master_kegiatan WHERE nama = 'SAKERNAS'
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, is_ketua_tim, nama_dokumen, required)
SELECT id, true, 'Proposal Kegiatan', true FROM master_kegiatan WHERE nama = 'SAKERNAS'
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, is_ketua_tim, nama_dokumen, required)
SELECT id, true, 'Form Permintaan', true FROM master_kegiatan WHERE nama = 'SAKERNAS'
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, is_ketua_tim, nama_dokumen, required)
SELECT id, true, 'Surat Keterangan Kendaraan Dinas', true FROM master_kegiatan WHERE nama = 'SAKERNAS'
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, is_ketua_tim, nama_dokumen, required)
SELECT id, true, 'Laporan Pertanggungjawaban', true FROM master_kegiatan WHERE nama = 'SAKERNAS'
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED DATA: Kelengkapan SAKERNAS (Anggota)
-- Idempotent
-- =====================================================
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, is_ketua_tim, nama_dokumen, required)
SELECT id, false, 'Surat Tugas', true FROM master_kegiatan WHERE nama = 'SAKERNAS'
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, is_ketua_tim, nama_dokumen, required)
SELECT id, false, 'KAK (Kerangka Acuan Kerja)', true FROM master_kegiatan WHERE nama = 'SAKERNAS'
ON CONFLICT DO NOTHING;
INSERT INTO master_kelengkapan_dokumen (kegiatan_id, is_ketua_tim, nama_dokumen, required)
SELECT id, false, 'Laporan Pelaksanaan', true FROM master_kegiatan WHERE nama = 'SAKERNAS'
ON CONFLICT DO NOTHING;
