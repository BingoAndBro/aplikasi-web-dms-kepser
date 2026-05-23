ALTER TABLE "arsip"."manual_arsip_attachment" ADD COLUMN IF NOT EXISTS "judul_lampiran" text;
--> statement-breakpoint
UPDATE "arsip"."manual_arsip_attachment"
SET "judul_lampiran" = COALESCE(
	NULLIF(btrim("judul_lampiran"), ''),
	NULLIF(btrim("original_filename"), ''),
	'Lampiran'
)
WHERE "judul_lampiran" IS NULL OR btrim("judul_lampiran") = '';
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip_attachment" ALTER COLUMN "judul_lampiran" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'manual_arsip_attachment_judul_lampiran_nonempty'
			AND conrelid = 'arsip.manual_arsip_attachment'::regclass
	) THEN
		ALTER TABLE "arsip"."manual_arsip_attachment"
		ADD CONSTRAINT "manual_arsip_attachment_judul_lampiran_nonempty"
		CHECK (length(trim("judul_lampiran")) > 0);
	END IF;
END $$;
