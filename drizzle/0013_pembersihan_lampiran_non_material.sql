-- 0013_pembersihan_lampiran_non_material
-- Fitur "Pembersihan Dokumen": ketua tim membersihkan LAMPIRAN FISIK dokumen
-- non-material (metadata/baris tetap ada). Bersifat menambah saja -- tidak
-- menyentuh `status` (posisi FSM), tidak mengubah `lampiran_urls`, dan tidak
-- mengubah lifecycle/guard berkas arsip material.
--
-- 1. dokumen.dokumen_transaksi: kolom kondisi lampiran (terpisah dari status).
-- 2. audit.audit_log: jejak lintas fitur, TANPA FK ke entitas (agar hard
--    delete tidak terblokir dan jejaknya sendiri tidak ikut ter-cascade).

CREATE SCHEMA IF NOT EXISTS "audit";
--> statement-breakpoint

-- 1. Kolom kondisi lampiran pada dokumen_transaksi
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'dokumen' AND table_name = 'dokumen_transaksi' AND column_name = 'lampiran_dibersihkan_at'
	) THEN
		ALTER TABLE "dokumen"."dokumen_transaksi" ADD COLUMN "lampiran_dibersihkan_at" timestamp with time zone;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'dokumen' AND table_name = 'dokumen_transaksi' AND column_name = 'lampiran_dibersihkan_by'
	) THEN
		ALTER TABLE "dokumen"."dokumen_transaksi" ADD COLUMN "lampiran_dibersihkan_by" uuid;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'dokumen' AND table_name = 'dokumen_transaksi' AND column_name = 'lampiran_dibersihkan_alasan'
	) THEN
		ALTER TABLE "dokumen"."dokumen_transaksi" ADD COLUMN "lampiran_dibersihkan_alasan" text;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'dokumen_transaksi_lampiran_dibersihkan_by_users_id_fk'
			AND conrelid = 'dokumen.dokumen_transaksi'::regclass
	) THEN
		ALTER TABLE "dokumen"."dokumen_transaksi"
		ADD CONSTRAINT "dokumen_transaksi_lampiran_dibersihkan_by_users_id_fk"
		FOREIGN KEY ("lampiran_dibersihkan_by")
		REFERENCES "auth"."users"("id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'dokumen_lampiran_dibersihkan_alasan_check'
			AND conrelid = 'dokumen.dokumen_transaksi'::regclass
	) THEN
		ALTER TABLE "dokumen"."dokumen_transaksi"
		ADD CONSTRAINT "dokumen_lampiran_dibersihkan_alasan_check"
		CHECK ("lampiran_dibersihkan_alasan" is null or "lampiran_dibersihkan_alasan" in ('BERKAS_DIMUSNAHKAN', 'PEMBERSIHAN_NON_MATERIAL'));
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dokumen_transaksi_lampiran_dibersihkan_at" ON "dokumen"."dokumen_transaksi" USING btree ("lampiran_dibersihkan_at");
--> statement-breakpoint

-- 2. audit.audit_log: jejak lintas fitur, entity_id TANPA FK (sengaja)
CREATE TABLE IF NOT EXISTS "audit"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"aksi" text NOT NULL,
	"actor_user_id" uuid,
	"metadata_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_entity_type_check" CHECK ("audit"."audit_log"."entity_type" in ('DOKUMEN')),
	CONSTRAINT "audit_log_aksi_check" CHECK ("audit"."audit_log"."aksi" in (
		'DOKUMEN_LAMPIRAN_DIBERSIHKAN',
		'DOKUMEN_DIHAPUS_PERMANEN',
		'BERKAS_LAMPIRAN_DIBERSIHKAN'
	))
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'audit_log_actor_user_id_users_id_fk'
			AND conrelid = 'audit.audit_log'::regclass
	) THEN
		ALTER TABLE "audit"."audit_log"
		ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk"
		FOREIGN KEY ("actor_user_id")
		REFERENCES "auth"."users"("id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_entity" ON "audit"."audit_log" USING btree ("entity_type", "entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_actor_created_at" ON "audit"."audit_log" USING btree ("actor_user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_aksi_created_at" ON "audit"."audit_log" USING btree ("aksi", "created_at");
