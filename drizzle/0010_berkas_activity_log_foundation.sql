CREATE TABLE IF NOT EXISTS "arsip"."berkas_arsip_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"berkas_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" uuid,
	"source_type" text,
	"workflow_document_id" uuid,
	"manual_document_id" uuid,
	"catatan" text,
	"metadata_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "berkas_arsip_activity_event_type_check" CHECK ("arsip"."berkas_arsip_activity"."event_type" in (
		'BERKAS_DIBUKA',
		'DOKUMEN_PERSETUJUAN_DIKLASIFIKASIKAN',
		'DOKUMEN_MANUAL_DITAMBAHKAN',
		'BERKAS_DITUTUP',
		'METADATA_ARSIP_AKTIF_DIPERBARUI',
		'BERKAS_DIPINDAHKAN_KE_INAKTIF',
		'BERKAS_DIPINDAHKAN_KE_USUL_MUSNAH',
		'BERKAS_DIMUSNAHKAN'
	)),
	CONSTRAINT "berkas_arsip_activity_source_type_check" CHECK ("arsip"."berkas_arsip_activity"."source_type" is null or "arsip"."berkas_arsip_activity"."source_type" in ('WORKFLOW', 'MANUAL')),
	CONSTRAINT "berkas_arsip_activity_source_reference_check" CHECK (("arsip"."berkas_arsip_activity"."source_type" is null and "arsip"."berkas_arsip_activity"."workflow_document_id" is null and "arsip"."berkas_arsip_activity"."manual_document_id" is null)
		or ("arsip"."berkas_arsip_activity"."source_type" = 'WORKFLOW' and "arsip"."berkas_arsip_activity"."workflow_document_id" is not null and "arsip"."berkas_arsip_activity"."manual_document_id" is null)
		or ("arsip"."berkas_arsip_activity"."source_type" = 'MANUAL' and "arsip"."berkas_arsip_activity"."manual_document_id" is not null and "arsip"."berkas_arsip_activity"."workflow_document_id" is null))
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'berkas_arsip_activity_berkas_id_berkas_arsip_id_fk'
			AND conrelid = 'arsip.berkas_arsip_activity'::regclass
	) THEN
		ALTER TABLE "arsip"."berkas_arsip_activity"
		ADD CONSTRAINT "berkas_arsip_activity_berkas_id_berkas_arsip_id_fk"
		FOREIGN KEY ("berkas_id")
		REFERENCES "arsip"."berkas_arsip"("id")
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
		WHERE conname = 'berkas_arsip_activity_actor_user_id_users_id_fk'
			AND conrelid = 'arsip.berkas_arsip_activity'::regclass
	) THEN
		ALTER TABLE "arsip"."berkas_arsip_activity"
		ADD CONSTRAINT "berkas_arsip_activity_actor_user_id_users_id_fk"
		FOREIGN KEY ("actor_user_id")
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
		WHERE conname = 'berkas_arsip_activity_workflow_document_id_dokumen_transaksi_id_fk'
			AND conrelid = 'arsip.berkas_arsip_activity'::regclass
	) THEN
		ALTER TABLE "arsip"."berkas_arsip_activity"
		ADD CONSTRAINT "berkas_arsip_activity_workflow_document_id_dokumen_transaksi_id_fk"
		FOREIGN KEY ("workflow_document_id")
		REFERENCES "dokumen"."dokumen_transaksi"("id")
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
		WHERE conname = 'berkas_arsip_activity_manual_document_id_manual_arsip_id_fk'
			AND conrelid = 'arsip.berkas_arsip_activity'::regclass
	) THEN
		ALTER TABLE "arsip"."berkas_arsip_activity"
		ADD CONSTRAINT "berkas_arsip_activity_manual_document_id_manual_arsip_id_fk"
		FOREIGN KEY ("manual_document_id")
		REFERENCES "arsip"."manual_arsip"("id")
		ON DELETE no action
		ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_berkas_arsip_activity_berkas_created_at" ON "arsip"."berkas_arsip_activity" USING btree ("berkas_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_berkas_arsip_activity_event_type" ON "arsip"."berkas_arsip_activity" USING btree ("event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_berkas_arsip_activity_actor_user_id" ON "arsip"."berkas_arsip_activity" USING btree ("actor_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_berkas_arsip_activity_workflow_document_id" ON "arsip"."berkas_arsip_activity" USING btree ("workflow_document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_berkas_arsip_activity_manual_document_id" ON "arsip"."berkas_arsip_activity" USING btree ("manual_document_id");
