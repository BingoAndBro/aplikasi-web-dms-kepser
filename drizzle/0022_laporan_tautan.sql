-- 0022_laporan_tautan
-- Fitur "Bagikan Tautan" di Laporan Saya / Laporan Kegiatan / Laporan Kinerja:
-- satu tautan permanen (sampai dicabut) berisi snapshot daftar dokumen, untuk
-- ditempel ke aplikasi lain. Pembuka tautan wajib login. Lihat
-- src/db/schema/app/laporan-tautan.ts dan src/lib/laporan/tautan.ts.

CREATE SCHEMA IF NOT EXISTS "app";
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "app"."laporan_tautan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"sumber" text NOT NULL,
	"judul" text NOT NULL,
	"keterangan" text,
	"dokumen_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"manual_arsip_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"last_accessed_at" timestamp with time zone,
	"jumlah_akses" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "laporan_tautan_token_unique" UNIQUE("token"),
	CONSTRAINT "laporan_tautan_sumber_check" CHECK ("app"."laporan_tautan"."sumber" in ('LAPORAN_SAYA', 'LAPORAN_KEGIATAN', 'LAPORAN_KINERJA'))
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'laporan_tautan_created_by_users_id_fk'
			AND conrelid = 'app.laporan_tautan'::regclass
	) THEN
		ALTER TABLE "app"."laporan_tautan"
		ADD CONSTRAINT "laporan_tautan_created_by_users_id_fk"
		FOREIGN KEY ("created_by")
		REFERENCES "auth"."users"("id")
		ON DELETE no action
		ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'laporan_tautan_revoked_by_users_id_fk'
			AND conrelid = 'app.laporan_tautan'::regclass
	) THEN
		ALTER TABLE "app"."laporan_tautan"
		ADD CONSTRAINT "laporan_tautan_revoked_by_users_id_fk"
		FOREIGN KEY ("revoked_by")
		REFERENCES "auth"."users"("id")
		ON DELETE no action
		ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_laporan_tautan_created_by_created_at"
	ON "app"."laporan_tautan" USING btree ("created_by", "created_at");
