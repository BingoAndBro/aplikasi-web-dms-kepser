ALTER TABLE "arsip"."arsip" ALTER COLUMN "dokumen_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "arsip"."arsip" ADD COLUMN IF NOT EXISTS "source_type" text DEFAULT 'WORKFLOW' NOT NULL;
--> statement-breakpoint
ALTER TABLE "arsip"."arsip" ADD COLUMN IF NOT EXISTS "nama_arsip" text;
--> statement-breakpoint
ALTER TABLE "arsip"."arsip" ADD COLUMN IF NOT EXISTS "klasifikasi_id" uuid;
--> statement-breakpoint
ALTER TABLE "arsip"."arsip" ADD COLUMN IF NOT EXISTS "klasifikasi_kode_snapshot" text;
--> statement-breakpoint
ALTER TABLE "arsip"."arsip" ADD COLUMN IF NOT EXISTS "klasifikasi_nama_snapshot" text;
--> statement-breakpoint
ALTER TABLE "arsip"."arsip" ADD COLUMN IF NOT EXISTS "created_by" uuid;
--> statement-breakpoint
ALTER TABLE "arsip"."arsip" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "arsip"."arsip" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'arsip_klasifikasi_id_master_klasifikasi_arsip_id_fk'
			AND conrelid = 'arsip.arsip'::regclass
	) THEN
		ALTER TABLE "arsip"."arsip"
		ADD CONSTRAINT "arsip_klasifikasi_id_master_klasifikasi_arsip_id_fk"
		FOREIGN KEY ("klasifikasi_id")
		REFERENCES "arsip"."master_klasifikasi_arsip"("id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'arsip_created_by_users_id_fk'
			AND conrelid = 'arsip.arsip'::regclass
	) THEN
		ALTER TABLE "arsip"."arsip"
		ADD CONSTRAINT "arsip_created_by_users_id_fk"
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
		WHERE conname = 'arsip_source_type_check'
			AND conrelid = 'arsip.arsip'::regclass
	) THEN
		ALTER TABLE "arsip"."arsip"
		ADD CONSTRAINT "arsip_source_type_check"
		CHECK ("source_type" in ('WORKFLOW', 'MANUAL'));
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_arsip_source_type" ON "arsip"."arsip" USING btree ("source_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_arsip_klasifikasi_id" ON "arsip"."arsip" USING btree ("klasifikasi_id");
