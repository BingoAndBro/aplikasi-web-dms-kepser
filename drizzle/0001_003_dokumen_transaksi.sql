CREATE TABLE "dokumen_transaksi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"judul" text NOT NULL,
	"fungsi_id" uuid NOT NULL,
	"kegiatan_jenis_id" uuid NOT NULL,
	"is_ketua_tim" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"current_step" text,
	"revision_target" text,
	"revision_notes" text,
	"lampiran_urls" text DEFAULT '[]' NOT NULL,
	"tahun" integer NOT NULL,
	"tanggal" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "log_aktivitas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dokumen_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"aksi" text NOT NULL,
	"catatan" text,
	"step_urutan" integer,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_fungsi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nama" text NOT NULL,
	"deskripsi" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_fungsi_nama_unique" UNIQUE("nama")
);
--> statement-breakpoint
CREATE TABLE "master_kegiatan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fungsi_id" uuid NOT NULL,
	"nama" text NOT NULL,
	"deskripsi" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_kelengkapan_dokumen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kegiatan_id" uuid NOT NULL,
	"is_ketua_tim" boolean NOT NULL,
	"nama_dokumen" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dokumen_transaksi" ADD CONSTRAINT "dokumen_transaksi_fungsi_id_master_fungsi_id_fk" FOREIGN KEY ("fungsi_id") REFERENCES "public"."master_fungsi"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dokumen_transaksi" ADD CONSTRAINT "dokumen_transaksi_kegiatan_jenis_id_master_kegiatan_id_fk" FOREIGN KEY ("kegiatan_jenis_id") REFERENCES "public"."master_kegiatan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_aktivitas" ADD CONSTRAINT "log_aktivitas_dokumen_id_dokumen_transaksi_id_fk" FOREIGN KEY ("dokumen_id") REFERENCES "public"."dokumen_transaksi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_kegiatan" ADD CONSTRAINT "master_kegiatan_fungsi_id_master_fungsi_id_fk" FOREIGN KEY ("fungsi_id") REFERENCES "public"."master_fungsi"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_kelengkapan_dokumen" ADD CONSTRAINT "master_kelengkapan_dokumen_kegiatan_id_master_kegiatan_id_fk" FOREIGN KEY ("kegiatan_id") REFERENCES "public"."master_kegiatan"("id") ON DELETE cascade ON UPDATE no action;