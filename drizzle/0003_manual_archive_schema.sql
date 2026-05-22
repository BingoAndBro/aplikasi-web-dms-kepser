CREATE TABLE "arsip"."manual_arsip_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nama" text NOT NULL,
	"deskripsi" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arsip"."manual_arsip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nama" text NOT NULL,
	"tanggal" date NOT NULL,
	"keterangan" text NOT NULL,
	"nominal_realisasi" numeric(15, 2),
	"category_id" uuid NOT NULL,
	"klasifikasi_id" uuid,
	"klasifikasi_nama_snapshot" text,
	"status_arsip" text DEFAULT 'AKTIF' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inactivated_at" timestamp with time zone,
	"inactivated_by" uuid,
	"proposed_destroy_at" timestamp with time zone,
	"proposed_destroy_by" uuid,
	"destroyed_at" timestamp with time zone,
	"destroyed_by" uuid,
	CONSTRAINT "manual_arsip_status_arsip_check" CHECK ("arsip"."manual_arsip"."status_arsip" in ('AKTIF', 'INAKTIF', 'USUL_MUSNAH', 'DIMUSNAHKAN')),
	CONSTRAINT "manual_arsip_nominal_realisasi_positive" CHECK ("arsip"."manual_arsip"."nominal_realisasi" is null or "arsip"."manual_arsip"."nominal_realisasi" >= 0)
);
--> statement-breakpoint
CREATE TABLE "arsip"."manual_arsip_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manual_arsip_id" uuid NOT NULL,
	"logical_path" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "manual_arsip_attachment_size_bytes_nonnegative" CHECK ("arsip"."manual_arsip_attachment"."size_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip" ADD CONSTRAINT "manual_arsip_category_id_manual_arsip_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "arsip"."manual_arsip_category"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip" ADD CONSTRAINT "manual_arsip_klasifikasi_id_master_klasifikasi_arsip_id_fk" FOREIGN KEY ("klasifikasi_id") REFERENCES "arsip"."master_klasifikasi_arsip"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip" ADD CONSTRAINT "manual_arsip_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip" ADD CONSTRAINT "manual_arsip_inactivated_by_users_id_fk" FOREIGN KEY ("inactivated_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip" ADD CONSTRAINT "manual_arsip_proposed_destroy_by_users_id_fk" FOREIGN KEY ("proposed_destroy_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip" ADD CONSTRAINT "manual_arsip_destroyed_by_users_id_fk" FOREIGN KEY ("destroyed_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip_attachment" ADD CONSTRAINT "manual_arsip_attachment_manual_arsip_id_manual_arsip_id_fk" FOREIGN KEY ("manual_arsip_id") REFERENCES "arsip"."manual_arsip"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip_attachment" ADD CONSTRAINT "manual_arsip_attachment_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "manual_arsip_category_nama_unique" ON "arsip"."manual_arsip_category" USING btree ("nama");
--> statement-breakpoint
CREATE INDEX "idx_manual_arsip_category_is_active" ON "arsip"."manual_arsip_category" USING btree ("is_active");
--> statement-breakpoint
CREATE INDEX "idx_manual_arsip_category_id" ON "arsip"."manual_arsip" USING btree ("category_id");
--> statement-breakpoint
CREATE INDEX "idx_manual_arsip_klasifikasi_id" ON "arsip"."manual_arsip" USING btree ("klasifikasi_id");
--> statement-breakpoint
CREATE INDEX "idx_manual_arsip_status_arsip" ON "arsip"."manual_arsip" USING btree ("status_arsip");
--> statement-breakpoint
CREATE INDEX "idx_manual_arsip_tanggal" ON "arsip"."manual_arsip" USING btree ("tanggal");
--> statement-breakpoint
CREATE INDEX "idx_manual_arsip_created_by" ON "arsip"."manual_arsip" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "idx_manual_arsip_attachment_manual_arsip_id" ON "arsip"."manual_arsip_attachment" USING btree ("manual_arsip_id");
--> statement-breakpoint
CREATE INDEX "idx_manual_arsip_attachment_created_by" ON "arsip"."manual_arsip_attachment" USING btree ("created_by");
--> statement-breakpoint
INSERT INTO "arsip"."manual_arsip_category" ("id", "nama", "deskripsi", "is_active", "created_at", "updated_at")
VALUES
	('aaaaaaaa-0000-4000-8000-000000000001', 'Pemeliharaan', 'Kategori arsip manual untuk pemeliharaan', true, now(), now()),
	('aaaaaaaa-0000-4000-8000-000000000002', 'Pengadaan', 'Kategori arsip manual untuk pengadaan', true, now(), now()),
	('aaaaaaaa-0000-4000-8000-000000000003', 'Lain-lain', 'Kategori arsip manual untuk arsip lainnya', true, now(), now())
ON CONFLICT ("nama") DO UPDATE
SET
	deskripsi = EXCLUDED.deskripsi,
	is_active = true,
	updated_at = now();
