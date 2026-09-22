-- 0016_decouple_jenis_permintaan_from_komponen
-- Jenis Permintaan is no longer a child of Komponen: it becomes an
-- independent top-level classification (nama unique globally while active).
-- Kegiatan -> Komponen stays a separate branch, used only for kelengkapan
-- dokumen matching (master_kelengkapan_dokumen.komponen_id is untouched).

ALTER TABLE "master"."master_jenis_permintaan" DROP CONSTRAINT IF EXISTS "master_jenis_permintaan_komponen_id_master_komponen_id_fk";
--> statement-breakpoint

DROP INDEX IF EXISTS "master"."idx_master_jenis_permintaan_komponen_id";
--> statement-breakpoint

DROP INDEX IF EXISTS "master"."idx_master_jenis_permintaan_komponen_active";
--> statement-breakpoint

DROP INDEX IF EXISTS "master"."master_jenis_permintaan_komponen_id_nama_active_unique";
--> statement-breakpoint

ALTER TABLE "master"."master_jenis_permintaan" DROP COLUMN IF EXISTS "komponen_id";
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "master_jenis_permintaan_nama_active_unique" ON "master"."master_jenis_permintaan" USING btree ("nama") WHERE is_active = true;
--> statement-breakpoint

ALTER TABLE "master"."master_kelengkapan_dokumen" DROP CONSTRAINT IF EXISTS "master_kelengkapan_jenis_requires_komponen_check";
