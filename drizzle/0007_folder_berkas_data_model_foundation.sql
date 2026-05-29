CREATE TABLE IF NOT EXISTS "arsip"."berkas_arsip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"klasifikasi_id" uuid NOT NULL,
	"klasifikasi_kode_snapshot" text,
	"klasifikasi_nama_snapshot" text NOT NULL,
	"status_berkas" text DEFAULT 'OPEN' NOT NULL,
	"nomor_spm" text,
	"retensi_aktif" text,
	"retensi_inaktif" text,
	"masa_aktif_berakhir" date,
	"masa_inaktif_berakhir" date,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "berkas_arsip_status_berkas_check" CHECK ("arsip"."berkas_arsip"."status_berkas" in ('OPEN', 'CLOSED')),
	CONSTRAINT "berkas_arsip_closed_metadata_check" CHECK (("arsip"."berkas_arsip"."status_berkas" = 'OPEN' and "arsip"."berkas_arsip"."closed_at" is null and "arsip"."berkas_arsip"."closed_by" is null)
		or ("arsip"."berkas_arsip"."status_berkas" = 'CLOSED' and "arsip"."berkas_arsip"."closed_at" is not null and "arsip"."berkas_arsip"."closed_by" is not null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "arsip"."berkas_arsip_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"berkas_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"dokumen_id" uuid,
	"manual_arsip_id" uuid,
	"canonical_arsip_id" uuid,
	"added_by" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "berkas_arsip_item_source_type_check" CHECK ("arsip"."berkas_arsip_item"."source_type" in ('WORKFLOW', 'MANUAL')),
	CONSTRAINT "berkas_arsip_item_source_reference_check" CHECK (("arsip"."berkas_arsip_item"."source_type" = 'WORKFLOW' and "arsip"."berkas_arsip_item"."dokumen_id" is not null and "arsip"."berkas_arsip_item"."manual_arsip_id" is null)
		or ("arsip"."berkas_arsip_item"."source_type" = 'MANUAL' and "arsip"."berkas_arsip_item"."manual_arsip_id" is not null and "arsip"."berkas_arsip_item"."dokumen_id" is null))
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'berkas_arsip_klasifikasi_id_master_klasifikasi_arsip_id_fk'
			AND conrelid = 'arsip.berkas_arsip'::regclass
	) THEN
		ALTER TABLE "arsip"."berkas_arsip"
		ADD CONSTRAINT "berkas_arsip_klasifikasi_id_master_klasifikasi_arsip_id_fk"
		FOREIGN KEY ("klasifikasi_id")
		REFERENCES "arsip"."master_klasifikasi_arsip"("id")
		ON DELETE restrict
		ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'berkas_arsip_closed_by_users_id_fk'
			AND conrelid = 'arsip.berkas_arsip'::regclass
	) THEN
		ALTER TABLE "arsip"."berkas_arsip"
		ADD CONSTRAINT "berkas_arsip_closed_by_users_id_fk"
		FOREIGN KEY ("closed_by")
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
		WHERE conname = 'berkas_arsip_created_by_users_id_fk'
			AND conrelid = 'arsip.berkas_arsip'::regclass
	) THEN
		ALTER TABLE "arsip"."berkas_arsip"
		ADD CONSTRAINT "berkas_arsip_created_by_users_id_fk"
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
		WHERE conname = 'berkas_arsip_item_berkas_id_berkas_arsip_id_fk'
			AND conrelid = 'arsip.berkas_arsip_item'::regclass
	) THEN
		ALTER TABLE "arsip"."berkas_arsip_item"
		ADD CONSTRAINT "berkas_arsip_item_berkas_id_berkas_arsip_id_fk"
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
		WHERE conname = 'berkas_arsip_item_dokumen_id_dokumen_transaksi_id_fk'
			AND conrelid = 'arsip.berkas_arsip_item'::regclass
	) THEN
		ALTER TABLE "arsip"."berkas_arsip_item"
		ADD CONSTRAINT "berkas_arsip_item_dokumen_id_dokumen_transaksi_id_fk"
		FOREIGN KEY ("dokumen_id")
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
		WHERE conname = 'berkas_arsip_item_manual_arsip_id_manual_arsip_id_fk'
			AND conrelid = 'arsip.berkas_arsip_item'::regclass
	) THEN
		ALTER TABLE "arsip"."berkas_arsip_item"
		ADD CONSTRAINT "berkas_arsip_item_manual_arsip_id_manual_arsip_id_fk"
		FOREIGN KEY ("manual_arsip_id")
		REFERENCES "arsip"."manual_arsip"("id")
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
		WHERE conname = 'berkas_arsip_item_canonical_arsip_id_arsip_id_fk'
			AND conrelid = 'arsip.berkas_arsip_item'::regclass
	) THEN
		ALTER TABLE "arsip"."berkas_arsip_item"
		ADD CONSTRAINT "berkas_arsip_item_canonical_arsip_id_arsip_id_fk"
		FOREIGN KEY ("canonical_arsip_id")
		REFERENCES "arsip"."arsip"("id")
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
		WHERE conname = 'berkas_arsip_item_added_by_users_id_fk'
			AND conrelid = 'arsip.berkas_arsip_item'::regclass
	) THEN
		ALTER TABLE "arsip"."berkas_arsip_item"
		ADD CONSTRAINT "berkas_arsip_item_added_by_users_id_fk"
		FOREIGN KEY ("added_by")
		REFERENCES "auth"."users"("id")
		ON DELETE no action
		ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_berkas_arsip_klasifikasi_id" ON "arsip"."berkas_arsip" USING btree ("klasifikasi_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_berkas_arsip_status_berkas" ON "arsip"."berkas_arsip" USING btree ("status_berkas");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_berkas_arsip_closed_at" ON "arsip"."berkas_arsip" USING btree ("closed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_berkas_arsip_created_by" ON "arsip"."berkas_arsip" USING btree ("created_by");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "berkas_arsip_open_klasifikasi_unique" ON "arsip"."berkas_arsip" USING btree ("klasifikasi_id") WHERE "status_berkas" = 'OPEN';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_berkas_arsip_item_berkas_id" ON "arsip"."berkas_arsip_item" USING btree ("berkas_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_berkas_arsip_item_source_type" ON "arsip"."berkas_arsip_item" USING btree ("source_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_berkas_arsip_item_added_by" ON "arsip"."berkas_arsip_item" USING btree ("added_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_berkas_arsip_item_canonical_arsip_id" ON "arsip"."berkas_arsip_item" USING btree ("canonical_arsip_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "berkas_arsip_item_dokumen_id_unique" ON "arsip"."berkas_arsip_item" USING btree ("dokumen_id") WHERE "dokumen_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "berkas_arsip_item_manual_arsip_id_unique" ON "arsip"."berkas_arsip_item" USING btree ("manual_arsip_id") WHERE "manual_arsip_id" IS NOT NULL;
