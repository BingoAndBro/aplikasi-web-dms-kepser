-- ============================================================
-- Migration: 005_arsip.sql
-- Deskripsi: Tabel arsip, master klasifikasi, verifikasi penyusutan, usul musnah
-- Dibuat: 2026-04-23 (SPEC 05 — Arsip Flow)
-- ============================================================

-- 1. Tabel arsip
CREATE TABLE IF NOT EXISTS arsip (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dokumen_id uuid NOT NULL REFERENCES dokumen_transaksi(id),
  nomor_surat text,
  klasifikasi text,
  retensi_aktif text,
  retensi_inaktif text,
  masa_aktif_berakhir date,
  masa_inaktif_berakhir date,
  status_arsip text NOT NULL DEFAULT 'AKTIF' CHECK (status_arsip IN ('AKTIF', 'VERIFIKASI_PENYUSUTAN', 'INAKTIF', 'USUL_MUSNAH')),
  is_ditolak boolean NOT NULL DEFAULT false,
  catatan_arsiparis text,
  archived_by uuid REFERENCES auth.users(id),
  archived_at timestamp DEFAULT now(),
  created_at timestamp DEFAULT now()
);

COMMENT ON TABLE arsip IS 'Tabel arsip dokumen — menyimpan metadata arsip dan lifecycle status';
COMMENT ON COLUMN arsip.dokumen_id IS 'FK ke dokumen_transaksi — satu arsip per dokumen';
COMMENT ON COLUMN arsip.status_arsip IS 'Lifecycle: AKTIF → VERIFIKASI_PENYUSUTAN → INAKTIF → USUL_MUSNAH';
COMMENT ON COLUMN arsip.masa_aktif_berakhir IS 'Tanggal masa retensi aktif berakhir — trigger auto-transition via cron';
COMMENT ON COLUMN arsip.masa_inaktif_berakhir IS 'Tanggal masa retensi inaktif berakhir — trigger auto-transition via cron';

-- 2. Tabel master_klasifikasi_arsip
CREATE TABLE IF NOT EXISTS master_klasifikasi_arsip (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL UNIQUE,
  deskripsi text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

COMMENT ON TABLE master_klasifikasi_arsip IS 'Master data klasifikasi arsip — e.g. Klasifikasi I s/d VII';

-- 3. Tabel arsip_verifikasi_penyusutan
CREATE TABLE IF NOT EXISTS arsip_verifikasi_penyusutan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arsip_id uuid NOT NULL REFERENCES arsip(id),
  status text NOT NULL DEFAULT 'MENUNGGU' CHECK (status IN ('MENUNGGU', 'DISETUJUI', 'DITOLAK')),
  catatan text,
  dipindahkan_oleh uuid REFERENCES auth.users(id),
  decided_by uuid REFERENCES auth.users(id),
  created_at timestamp DEFAULT now(),
  decided_at timestamp,
  CONSTRAINT arsip_verifikasi_penyusutan_arsip_id_unique UNIQUE (arsip_id)
);

COMMENT ON TABLE arsip_verifikasi_penyusutan IS 'Queue verifikasi penyusutan — arsip dipindahkan dari AKTIF ke INAKTIF butuh approve Arsiparis';
COMMENT ON COLUMN arsip_verifikasi_penyusutan.arsip_id IS 'UNIQUE constraint memastikan hanya satu record aktif per arsip';

-- 4. Tabel arsip_usul_musnah
CREATE TABLE IF NOT EXISTS arsip_usul_musnah (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arsip_id uuid NOT NULL REFERENCES arsip(id),
  status text NOT NULL DEFAULT 'MENUNGGU' CHECK (status IN ('MENUNGGU', 'DISETUJUI', 'DITOLAK')),
  catatan text,
  diusulkan_oleh uuid REFERENCES auth.users(id),
  decided_by uuid REFERENCES auth.users(id),
  created_at timestamp DEFAULT now(),
  decided_at timestamp,
  CONSTRAINT arsip_usul_musnah_arsip_id_unique UNIQUE (arsip_id)
);

COMMENT ON TABLE arsip_usul_musnah IS 'Queue usul musnah — arsip yang akan dimusnahkan butuh approve Arsiparis';
COMMENT ON COLUMN arsip_usul_musnah.arsip_id IS 'UNIQUE constraint memastikan hanya satu record aktif per arsip';

-- 5. Index untuk query performance
CREATE INDEX IF NOT EXISTS idx_arsip_status_arsip ON arsip(status_arsip);
CREATE INDEX IF NOT EXISTS idx_arsip_dokumen_id ON arsip(dokumen_id);
CREATE INDEX IF NOT EXISTS idx_arsip_masa_aktif_berakhir ON arsip(masa_aktif_berakhir) WHERE status_arsip = 'AKTIF';
CREATE INDEX IF NOT EXISTS idx_arsip_masa_inaktif_berakhir ON arsip(masa_inaktif_berakhir) WHERE status_arsip = 'INAKTIF';
CREATE INDEX IF NOT EXISTS idx_arsip_verifikasi_arsip_id ON arsip_verifikasi_penyusutan(arsip_id);
CREATE INDEX IF NOT EXISTS idx_arsip_usul_musnah_arsip_id ON arsip_usul_musnah(arsip_id);
CREATE INDEX IF NOT EXISTS idx_master_klasifikasi_active ON master_klasifikasi_arsip(is_active) WHERE is_active = true;

-- 6. RLS Policies
ALTER TABLE arsip ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_klasifikasi_arsip ENABLE ROW LEVEL SECURITY;
ALTER TABLE arsip_verifikasi_penyusutan ENABLE ROW LEVEL SECURITY;
ALTER TABLE arsip_usul_musnah ENABLE ROW LEVEL SECURITY;

-- arsip: semua authenticated user bisa SELECT
CREATE POLICY "arsip_select_all_authenticated" ON arsip
  FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

-- arsip: ARSIPARIS dan ADMIN bisa INSERT (arsipkan / skip)
CREATE POLICY "arsip_insert_arsiparis_admin" ON arsip
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = (SELECT auth.uid())
      AND r.nama IN ('ARSIPARIS', 'ADMIN')
    )
  );

-- arsip: ARSIPARIS dan ADMIN bisa UPDATE (misal untuk update catatan)
CREATE POLICY "arsip_update_arsiparis_admin" ON arsip
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = (SELECT auth.uid())
      AND r.nama IN ('ARSIPARIS', 'ADMIN')
    )
  );

-- arsip: ARSIPARIS dan ADMIN bisa DELETE (saat usul musnah disetujui)
CREATE POLICY "arsip_delete_arsiparis_admin" ON arsip
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = (SELECT auth.uid())
      AND r.nama IN ('ARSIPARIS', 'ADMIN')
    )
  );

-- arsip_verifikasi_penyusutan: ARSIPARIS dan ADMIN bisa SELECT
CREATE POLICY "verifikasi_select_arsiparis_admin" ON arsip_verifikasi_penyusutan
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = (SELECT auth.uid())
      AND r.nama IN ('ARSIPARIS', 'ADMIN')
    )
  );

-- arsip_verifikasi_penyusutan: ARSIPARIS dan ADMIN bisa INSERT (pindahkan)
CREATE POLICY "verifikasi_insert_arsiparis_admin" ON arsip_verifikasi_penyusutan
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = (SELECT auth.uid())
      AND r.nama IN ('ARSIPARIS', 'ADMIN')
    )
  );

-- arsip_verifikasi_penyusutan: ARSIPARIS dan ADMIN bisa UPDATE (putuskan)
CREATE POLICY "verifikasi_update_arsiparis_admin" ON arsip_verifikasi_penyusutan
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = (SELECT auth.uid())
      AND r.nama IN ('ARSIPARIS', 'ADMIN')
    )
  );

-- arsip_usul_musnah: ARSIPARIS dan ADMIN bisa SELECT
CREATE POLICY "musnah_select_arsiparis_admin" ON arsip_usul_musnah
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = (SELECT auth.uid())
      AND r.nama IN ('ARSIPARIS', 'ADMIN')
    )
  );

-- arsip_usul_musnah: ARSIPARIS dan ADMIN bisa INSERT
CREATE POLICY "musnah_insert_arsiparis_admin" ON arsip_usul_musnah
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = (SELECT auth.uid())
      AND r.nama IN ('ARSIPARIS', 'ADMIN')
    )
  );

-- arsip_usul_musnah: ARSIPARIS dan ADMIN bisa UPDATE
CREATE POLICY "musnah_update_arsiparis_admin" ON arsip_usul_musnah
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = (SELECT auth.uid())
      AND r.nama IN ('ARSIPARIS', 'ADMIN')
    )
  );

-- arsip_usul_musnah: ARSIPARIS dan ADMIN bisa DELETE
CREATE POLICY "musnah_delete_arsiparis_admin" ON arsip_usul_musnah
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = (SELECT auth.uid())
      AND r.nama IN ('ARSIPARIS', 'ADMIN')
    )
  );

-- master_klasifikasi_arsip: semua authenticated bisa SELECT (untuk dropdown)
CREATE POLICY "klasifikasi_select_all_authenticated" ON master_klasifikasi_arsip
  FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

-- master_klasifikasi_arsip: ADMIN dan ARSIPARIS bisa INSERT/UPDATE/DELETE
CREATE POLICY "klasifikasi_manage_arsiparis_admin" ON master_klasifikasi_arsip
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = (SELECT auth.uid())
      AND r.nama IN ('ARSIPARIS', 'ADMIN')
    )
  );

-- 7. Seed data
INSERT INTO master_klasifikasi_arsip (nama, deskripsi) VALUES
  ('Klasifikasi I', 'Surat tugas / penunjukan'),
  ('Klasifikasi II', 'Surat masuk / keluar'),
  ('Klasifikasi III', 'Laporan kegiatan'),
  ('Klasifikasi IV', 'Proposal / Rencana kerja'),
  ('Klasifikasi V', 'Data statistik / laporan periodik'),
  ('Klasifikasi VI', 'Dokumen keuangan / pertanggungjawaban'),
  ('Klasifikasi VII', 'Dokumen hukum / legal')
ON CONFLICT (nama) DO NOTHING;

-- Seed role ARSIPARIS (jika belum ada)
INSERT INTO roles (nama, deskripsi) VALUES
  ('ARSIPARIS', 'Role untuk mengelola arsip dokumen')
ON CONFLICT (nama) DO NOTHING;