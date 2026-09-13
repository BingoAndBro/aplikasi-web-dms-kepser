-- Migration: 003_dokumen_transaksi
-- Created by: Deep Implement (SPEC 03)
-- Description: Tables for dokumen_transaksi and log_aktivitas

-- ============================================================
-- TABLE: dokumen_transaksi
-- Dokumen yang diajukan pegawai melalui multi-step form
-- ============================================================
CREATE TABLE IF NOT EXISTS "dokumen_transaksi" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "judul" text NOT NULL,
  "fungsi_id" uuid NOT NULL REFERENCES "public"."master_fungsi"("id") ON DELETE restrict ON UPDATE no action,
  "kegiatan_jenis_id" uuid NOT NULL REFERENCES "public"."master_kegiatan"("id") ON DELETE restrict ON UPDATE no action,
  "is_ketua_tim" boolean DEFAULT false NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "current_step" text,
  "revision_target" text,
  "revision_notes" text,
  "lampiran_urls" text NOT NULL DEFAULT '[]',
  "tahun" integer NOT NULL,
  "tanggal" text NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "dokumen_transaksi" IS 'Dokumen transaksi/SPD yang diajukan pegawai';
COMMENT ON COLUMN "dokumen_transaksi"."status" IS 'DRAFT | IN_PPK_VALIDATION | IN_PPSPM_APPROVAL | NEED_REVISION | COMPLETED | ARCHIVED';
COMMENT ON COLUMN "dokumen_transaksi"."current_step" IS 'PPK | PPSPM | null';
COMMENT ON COLUMN "dokumen_transaksi"."revision_target" IS 'USER | PPK | null — siapa yang perlu memperbaiki';
COMMENT ON COLUMN "dokumen_transaksi"."lampiran_urls" IS 'JSON array of { kelengkapan_id, nama, url, uploaded_at }';

-- ============================================================
-- TABLE: log_aktivitas
-- Audit trail (append-only — NO UPDATE/DELETE allowed)
-- ============================================================
CREATE TABLE IF NOT EXISTS "log_aktivitas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dokumen_id" uuid NOT NULL REFERENCES "public"."dokumen_transaksi"("id") ON DELETE cascade ON UPDATE no action,
  "user_id" uuid NOT NULL,
  "aksi" text NOT NULL,
  "catatan" text,
  "step_urutan" integer,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "log_aktivitas" IS 'Audit trail — APPEND ONLY. Tidak ada operasi UPDATE/DELETE.';
COMMENT ON COLUMN "log_aktivitas"."aksi" IS 'SUBMIT | RESUBMIT | PPK_APPROVE | PPK_REJECT | PPSPM_APPROVE | PPSPM_REJECT | ARCHIVE | ARCHIVE_SKIP';

-- ============================================================
-- INDEX: for faster log_aktivitas queries by dokumen_id
-- ============================================================
CREATE INDEX IF NOT EXISTS "log_aktivitas_dokumen_id_idx" ON "log_aktivitas"("dokumen_id");
CREATE INDEX IF NOT EXISTS "log_aktivitas_user_id_idx" ON "log_aktivitas"("user_id");

-- ============================================================
-- RLS: dokumen_transaksi
-- ============================================================
ALTER TABLE "dokumen_transaksi" ENABLE ROW LEVEL SECURITY;

-- PEGAWAI: can see/edit own records
CREATE POLICY "pegawai_select_own_dokumen" ON "dokumen_transaksi"
  FOR SELECT USING (auth.uid() = "created_by");

CREATE POLICY "pegawai_insert_own_dokumen" ON "dokumen_transaksi"
  FOR INSERT WITH CHECK (auth.uid() = "created_by");

-- Update hanya untuk NEED_REVISION target USER
CREATE POLICY "pegawai_update_own_dokumen" ON "dokumen_transaksi"
  FOR UPDATE USING (
    auth.uid() = "created_by"
    AND "status" = 'NEED_REVISION'
    AND "revision_target" = 'USER'
  );

-- PPK/PPSPM/ARSIPARIS/ADMIN: can see documents in their step
CREATE POLICY "approver_select_dokumen" ON "dokumen_transaksi"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "public"."user_roles" ur
      JOIN "public"."roles" r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.nama IN ('PPK', 'PPSPM', 'ARSIPARIS', 'ADMIN')
    )
  );

-- ============================================================
-- RLS: log_aktivitas
-- ============================================================
ALTER TABLE "log_aktivitas" ENABLE ROW LEVEL SECURITY;

-- Owner, dokumen creator, or approver role can read
CREATE POLICY "log_read" ON "log_aktivitas"
  FOR SELECT USING (
    auth.uid() = "user_id"
    OR EXISTS (
      SELECT 1 FROM "public"."dokumen_transaksi" dt
      WHERE dt.id = "dokumen_id" AND dt.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM "public"."user_roles" ur
      JOIN "public"."roles" r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.nama IN ('PPK', 'PPSPM', 'ARSIPARIS', 'ADMIN')
    )
  );

CREATE POLICY "log_insert" ON "log_aktivitas"
  FOR INSERT WITH CHECK (auth.uid() = "user_id");

-- NO UPDATE or DELETE policy for log_aktivitas (append-only enforcement)
