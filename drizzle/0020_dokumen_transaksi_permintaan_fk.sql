-- 0020_dokumen_transaksi_permintaan_fk
-- D-20: dokumen_transaksi.jenis_permintaan_id / kategori_permintaan_id /
-- detail_permintaan_id were plain uuid columns with no foreign key, so their
-- integrity relied on the application alone. They now reference the master
-- tables with the same policy as komponen_id (ON DELETE restrict).
-- Checked before adding (local DB, 2026-09-27): 0 orphan rows in all three
-- columns out of 24 dokumen_transaksi rows. The constraint names follow the
-- Drizzle default; Postgres truncates them to 63 characters.

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'dokumen_transaksi_jenis_permintaan_id_master_jenis_permintaan_id_fk'
			AND conrelid = 'dokumen.dokumen_transaksi'::regclass
	) THEN
		ALTER TABLE "dokumen"."dokumen_transaksi"
		ADD CONSTRAINT "dokumen_transaksi_jenis_permintaan_id_master_jenis_permintaan_id_fk"
		FOREIGN KEY ("jenis_permintaan_id") REFERENCES "master"."master_jenis_permintaan"("id")
		ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'dokumen_transaksi_kategori_permintaan_id_master_kategori_permintaan_id_fk'
			AND conrelid = 'dokumen.dokumen_transaksi'::regclass
	) THEN
		ALTER TABLE "dokumen"."dokumen_transaksi"
		ADD CONSTRAINT "dokumen_transaksi_kategori_permintaan_id_master_kategori_permintaan_id_fk"
		FOREIGN KEY ("kategori_permintaan_id") REFERENCES "master"."master_kategori_permintaan"("id")
		ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'dokumen_transaksi_detail_permintaan_id_master_detail_permintaan_id_fk'
			AND conrelid = 'dokumen.dokumen_transaksi'::regclass
	) THEN
		ALTER TABLE "dokumen"."dokumen_transaksi"
		ADD CONSTRAINT "dokumen_transaksi_detail_permintaan_id_master_detail_permintaan_id_fk"
		FOREIGN KEY ("detail_permintaan_id") REFERENCES "master"."master_detail_permintaan"("id")
		ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;
