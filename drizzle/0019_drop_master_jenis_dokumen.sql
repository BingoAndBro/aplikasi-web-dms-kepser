-- 0019_drop_master_jenis_dokumen
-- master_jenis_dokumen was a leftover from before non-material documents got a
-- free-text nama_dokumen: no form wrote dokumen_transaksi.jenis_dokumen_id and
-- the admin page was already hidden from navigation. Checked before dropping
-- (local DB, 2026-09-24): 0 of 23 dokumen_transaksi rows referenced it, the only
-- FK was dokumen_transaksi.jenis_dokumen_id, and no view/function used it.
-- The column is dropped together with the table since it is empty everywhere.

ALTER TABLE "dokumen"."dokumen_transaksi" DROP CONSTRAINT IF EXISTS "dokumen_transaksi_jenis_dokumen_id_master_jenis_dokumen_id_fk";
--> statement-breakpoint

ALTER TABLE "dokumen"."dokumen_transaksi" DROP COLUMN IF EXISTS "jenis_dokumen_id";
--> statement-breakpoint

DROP TABLE IF EXISTS "master"."master_jenis_dokumen";
