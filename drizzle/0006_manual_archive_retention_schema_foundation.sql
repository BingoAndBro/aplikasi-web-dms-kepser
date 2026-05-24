ALTER TABLE "arsip"."manual_arsip" ADD COLUMN IF NOT EXISTS "nomor_surat" text;
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip" ADD COLUMN IF NOT EXISTS "tanggal_diarsipkan" date;
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip" ADD COLUMN IF NOT EXISTS "retensi_aktif" text;
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip" ADD COLUMN IF NOT EXISTS "retensi_inaktif" text;
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip" ADD COLUMN IF NOT EXISTS "masa_aktif_berakhir" date;
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip" ADD COLUMN IF NOT EXISTS "masa_inaktif_berakhir" date;
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip" ADD COLUMN IF NOT EXISTS "klasifikasi_kode_snapshot" text;
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip" ADD COLUMN IF NOT EXISTS "archived_by" uuid;
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip" ADD COLUMN IF NOT EXISTS "canonical_arsip_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'manual_arsip_archived_by_users_id_fk'
			AND conrelid = 'arsip.manual_arsip'::regclass
	) THEN
		ALTER TABLE "arsip"."manual_arsip"
		ADD CONSTRAINT "manual_arsip_archived_by_users_id_fk"
		FOREIGN KEY ("archived_by")
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
		WHERE conname = 'manual_arsip_canonical_arsip_id_arsip_id_fk'
			AND conrelid = 'arsip.manual_arsip'::regclass
	) THEN
		ALTER TABLE "arsip"."manual_arsip"
		ADD CONSTRAINT "manual_arsip_canonical_arsip_id_arsip_id_fk"
		FOREIGN KEY ("canonical_arsip_id")
		REFERENCES "arsip"."arsip"("id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_manual_arsip_tanggal_diarsipkan" ON "arsip"."manual_arsip" USING btree ("tanggal_diarsipkan");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "manual_arsip_canonical_arsip_id_unique" ON "arsip"."manual_arsip" USING btree ("canonical_arsip_id") WHERE "canonical_arsip_id" IS NOT NULL;
