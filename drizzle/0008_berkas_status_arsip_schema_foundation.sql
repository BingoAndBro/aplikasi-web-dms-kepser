ALTER TABLE "arsip"."berkas_arsip" ADD COLUMN IF NOT EXISTS "status_arsip" text;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'berkas_arsip_status_arsip_check'
			AND conrelid = 'arsip.berkas_arsip'::regclass
	) THEN
		ALTER TABLE "arsip"."berkas_arsip"
		ADD CONSTRAINT "berkas_arsip_status_arsip_check"
		CHECK ("status_arsip" IS NULL OR "status_arsip" IN ('AKTIF', 'INAKTIF', 'USUL_MUSNAH', 'DIMUSNAHKAN'));
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'berkas_arsip_open_status_arsip_null_check'
			AND conrelid = 'arsip.berkas_arsip'::regclass
	) THEN
		ALTER TABLE "arsip"."berkas_arsip"
		ADD CONSTRAINT "berkas_arsip_open_status_arsip_null_check"
		CHECK ("status_berkas" <> 'OPEN' OR "status_arsip" IS NULL);
	END IF;
END $$;
