-- 0012_workflow_ubah_alur_v1_foundation
-- Ubah Alur Bisnis v1 — hierarki master data jadi satu rantai terhubung:
--   Fungsi -> Kegiatan -> Komponen -> Jenis Permintaan -> Kategori -> Detail -> Kelengkapan
-- Bersifat menambah, KECUALI: manual_arsip_category dihapus total; master_jenis_permintaan
-- mendapat induk komponen_id. DB lokal/dev: tabel transaksi + tabel referensi
-- (jenis/kategori/detail/kelengkapan permintaan) di-TRUNCATE lalu di-reseed (`pnpm db:local:seed`).

-- 1. master.master_komponen (anak master_kegiatan)
CREATE TABLE IF NOT EXISTS "master"."master_komponen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kegiatan_id" uuid NOT NULL,
	"nama" text NOT NULL,
	"deskripsi" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'master_komponen_kegiatan_id_master_kegiatan_id_fk'
			AND conrelid = 'master.master_komponen'::regclass
	) THEN
		ALTER TABLE "master"."master_komponen"
		ADD CONSTRAINT "master_komponen_kegiatan_id_master_kegiatan_id_fk"
		FOREIGN KEY ("kegiatan_id") REFERENCES "master"."master_kegiatan"("id")
		ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_master_komponen_kegiatan_id" ON "master"."master_komponen" USING btree ("kegiatan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_master_komponen_is_active" ON "master"."master_komponen" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_master_komponen_kegiatan_active" ON "master"."master_komponen" USING btree ("kegiatan_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "master_komponen_kegiatan_id_nama_active_unique" ON "master"."master_komponen" USING btree ("kegiatan_id","nama") WHERE "master"."master_komponen"."is_active" = true;--> statement-breakpoint

-- 2. Wipe data lokal/dev: tabel transaksi + tabel referensi permintaan yang berubah induk / dapat FK NOT NULL baru
TRUNCATE TABLE
	"arsip"."berkas_arsip_activity",
	"arsip"."berkas_arsip_item",
	"arsip"."berkas_arsip",
	"arsip"."manual_arsip_attachment",
	"arsip"."manual_arsip",
	"dokumen"."log_aktivitas",
	"dokumen"."dokumen_transaksi",
	"master"."master_kelengkapan_dokumen",
	"master"."master_detail_permintaan",
	"master"."master_kategori_permintaan",
	"master"."master_jenis_permintaan"
RESTART IDENTITY CASCADE;--> statement-breakpoint

-- 3. master.master_jenis_permintaan -> anak master_komponen
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'master' AND table_name = 'master_jenis_permintaan' AND column_name = 'komponen_id'
	) THEN
		ALTER TABLE "master"."master_jenis_permintaan" ADD COLUMN "komponen_id" uuid NOT NULL;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'master_jenis_permintaan_komponen_id_master_komponen_id_fk'
			AND conrelid = 'master.master_jenis_permintaan'::regclass
	) THEN
		ALTER TABLE "master"."master_jenis_permintaan"
		ADD CONSTRAINT "master_jenis_permintaan_komponen_id_master_komponen_id_fk"
		FOREIGN KEY ("komponen_id") REFERENCES "master"."master_komponen"("id")
		ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "master"."master_jenis_permintaan_nama_active_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "master"."idx_master_jenis_permintaan_is_active";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_master_jenis_permintaan_komponen_id" ON "master"."master_jenis_permintaan" USING btree ("komponen_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_master_jenis_permintaan_komponen_active" ON "master"."master_jenis_permintaan" USING btree ("komponen_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "master_jenis_permintaan_komponen_id_nama_active_unique" ON "master"."master_jenis_permintaan" USING btree ("komponen_id","nama") WHERE "master"."master_jenis_permintaan"."is_active" = true;--> statement-breakpoint

-- 4. master.master_kelengkapan_dokumen -> tambah komponen_id (nullable) ke rantai
ALTER TABLE "master"."master_kelengkapan_dokumen" ADD COLUMN IF NOT EXISTS "komponen_id" uuid;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'master_kelengkapan_dokumen_komponen_id_master_komponen_id_fk'
			AND conrelid = 'master.master_kelengkapan_dokumen'::regclass
	) THEN
		ALTER TABLE "master"."master_kelengkapan_dokumen"
		ADD CONSTRAINT "master_kelengkapan_dokumen_komponen_id_master_komponen_id_fk"
		FOREIGN KEY ("komponen_id") REFERENCES "master"."master_komponen"("id")
		ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "master"."idx_master_kelengkapan_chain";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_master_kelengkapan_chain" ON "master"."master_kelengkapan_dokumen" USING btree ("kegiatan_id","is_ketua_tim","komponen_id","jenis_permintaan_id","kategori_permintaan_id","detail_permintaan_id");--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'master_kelengkapan_jenis_requires_komponen_check'
			AND conrelid = 'master.master_kelengkapan_dokumen'::regclass
	) THEN
		ALTER TABLE "master"."master_kelengkapan_dokumen"
		ADD CONSTRAINT "master_kelengkapan_jenis_requires_komponen_check"
		CHECK ("master"."master_kelengkapan_dokumen"."jenis_permintaan_id" is null
			or "master"."master_kelengkapan_dokumen"."komponen_id" is not null);
	END IF;
END $$;
--> statement-breakpoint

-- 5. dokumen.dokumen_transaksi -> komponen_id (nullable FK) + nama_dokumen (teks bebas non-material)
ALTER TABLE "dokumen"."dokumen_transaksi" ADD COLUMN IF NOT EXISTS "komponen_id" uuid;--> statement-breakpoint
ALTER TABLE "dokumen"."dokumen_transaksi" ADD COLUMN IF NOT EXISTS "nama_dokumen" text;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'dokumen_transaksi_komponen_id_master_komponen_id_fk'
			AND conrelid = 'dokumen.dokumen_transaksi'::regclass
	) THEN
		ALTER TABLE "dokumen"."dokumen_transaksi"
		ADD CONSTRAINT "dokumen_transaksi_komponen_id_master_komponen_id_fk"
		FOREIGN KEY ("komponen_id") REFERENCES "master"."master_komponen"("id")
		ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dokumen_transaksi_komponen_id" ON "dokumen"."dokumen_transaksi" USING btree ("komponen_id");--> statement-breakpoint

-- 6. arsip.manual_arsip -> buang kategori; tambah fungsi_id / kegiatan_id / komponen_id (NOT NULL)
ALTER TABLE "arsip"."manual_arsip" DROP CONSTRAINT IF EXISTS "manual_arsip_category_id_manual_arsip_category_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "arsip"."idx_manual_arsip_category_id";--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip" DROP COLUMN IF EXISTS "category_id";--> statement-breakpoint
DROP TABLE IF EXISTS "arsip"."manual_arsip_category";--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='arsip' AND table_name='manual_arsip' AND column_name='fungsi_id') THEN
		ALTER TABLE "arsip"."manual_arsip" ADD COLUMN "fungsi_id" uuid NOT NULL;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='arsip' AND table_name='manual_arsip' AND column_name='kegiatan_id') THEN
		ALTER TABLE "arsip"."manual_arsip" ADD COLUMN "kegiatan_id" uuid NOT NULL;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='arsip' AND table_name='manual_arsip' AND column_name='komponen_id') THEN
		ALTER TABLE "arsip"."manual_arsip" ADD COLUMN "komponen_id" uuid NOT NULL;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='manual_arsip_fungsi_id_master_fungsi_id_fk' AND conrelid='arsip.manual_arsip'::regclass) THEN
		ALTER TABLE "arsip"."manual_arsip" ADD CONSTRAINT "manual_arsip_fungsi_id_master_fungsi_id_fk" FOREIGN KEY ("fungsi_id") REFERENCES "master"."master_fungsi"("id") ON DELETE restrict ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='manual_arsip_kegiatan_id_master_kegiatan_id_fk' AND conrelid='arsip.manual_arsip'::regclass) THEN
		ALTER TABLE "arsip"."manual_arsip" ADD CONSTRAINT "manual_arsip_kegiatan_id_master_kegiatan_id_fk" FOREIGN KEY ("kegiatan_id") REFERENCES "master"."master_kegiatan"("id") ON DELETE restrict ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='manual_arsip_komponen_id_master_komponen_id_fk' AND conrelid='arsip.manual_arsip'::regclass) THEN
		ALTER TABLE "arsip"."manual_arsip" ADD CONSTRAINT "manual_arsip_komponen_id_master_komponen_id_fk" FOREIGN KEY ("komponen_id") REFERENCES "master"."master_komponen"("id") ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_manual_arsip_fungsi_id" ON "arsip"."manual_arsip" USING btree ("fungsi_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_manual_arsip_kegiatan_id" ON "arsip"."manual_arsip" USING btree ("kegiatan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_manual_arsip_komponen_id" ON "arsip"."manual_arsip" USING btree ("komponen_id");
