CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_hash_algorithm" text DEFAULT 'argon2id' NOT NULL,
	"display_name" text,
	"nama_lengkap" text,
	"nip_nrp" text,
	"departemen" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"inactive_reason" text,
	"deactivated_at" timestamp with time zone,
	"deactivated_by" uuid,
	"last_login_at" timestamp with time zone,
	"password_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nama" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "auth"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"remember_me" boolean DEFAULT false NOT NULL,
	"user_agent" text,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "master"."master_fungsi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nama" text NOT NULL,
	"deskripsi" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master"."master_kegiatan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fungsi_id" uuid NOT NULL,
	"nama" text NOT NULL,
	"deskripsi" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master"."master_jenis_permintaan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nama" text NOT NULL,
	"deskripsi" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master"."master_kategori_permintaan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jenis_permintaan_id" uuid NOT NULL,
	"nama" text NOT NULL,
	"deskripsi" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master"."master_detail_permintaan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kategori_permintaan_id" uuid NOT NULL,
	"nama" text NOT NULL,
	"deskripsi" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master"."master_jenis_dokumen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nama" text NOT NULL,
	"deskripsi" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master"."master_kelengkapan_dokumen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kegiatan_id" uuid NOT NULL,
	"is_ketua_tim" boolean NOT NULL,
	"nama_dokumen" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"jenis_permintaan_id" uuid,
	"kategori_permintaan_id" uuid,
	"detail_permintaan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_kelengkapan_kategori_requires_jenis_check" CHECK ("master"."master_kelengkapan_dokumen"."kategori_permintaan_id" is null or "master"."master_kelengkapan_dokumen"."jenis_permintaan_id" is not null),
	CONSTRAINT "master_kelengkapan_detail_requires_kategori_check" CHECK ("master"."master_kelengkapan_dokumen"."detail_permintaan_id" is null or "master"."master_kelengkapan_dokumen"."kategori_permintaan_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "master"."ketua_tim_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kegiatan_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "dokumen"."dokumen_transaksi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"judul" text NOT NULL,
	"fungsi_id" uuid NOT NULL,
	"kegiatan_jenis_id" uuid NOT NULL,
	"is_ketua_tim" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"current_step" text,
	"revision_target" text,
	"revision_notes" text,
	"lampiran_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tahun" integer NOT NULL,
	"tanggal" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"jenis_permintaan_id" uuid,
	"kategori_permintaan_id" uuid,
	"detail_permintaan_id" uuid,
	"nominal_realisasi" numeric(15, 2) DEFAULT '0',
	"is_non_material" boolean DEFAULT false,
	"keterangan_detail" text,
	"jenis_dokumen_id" uuid,
	CONSTRAINT "dokumen_nominal_realisasi_positive" CHECK ("dokumen"."dokumen_transaksi"."nominal_realisasi" is null or "dokumen"."dokumen_transaksi"."nominal_realisasi" >= 0)
);
--> statement-breakpoint
CREATE TABLE "dokumen"."log_aktivitas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dokumen_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"aksi" text NOT NULL,
	"catatan" text,
	"step_urutan" integer,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arsip"."arsip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dokumen_id" uuid NOT NULL,
	"nomor_surat" text,
	"klasifikasi" text,
	"retensi_aktif" text,
	"retensi_inaktif" text,
	"masa_aktif_berakhir" date,
	"masa_inaktif_berakhir" date,
	"status_arsip" text DEFAULT 'AKTIF' NOT NULL,
	"is_ditolak" boolean DEFAULT false NOT NULL,
	"catatan_arsiparis" text,
	"archived_by" uuid,
	"archived_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"lampiran_snapshot" jsonb,
	"musnah_at" timestamp with time zone,
	"musnah_by" uuid,
	"musnah_catatan" text,
	"nominal_realisasi" numeric(15, 2)
);
--> statement-breakpoint
CREATE TABLE "arsip"."master_klasifikasi_arsip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nama" text NOT NULL,
	"deskripsi" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"parent_id" uuid,
	"kode" text
);
--> statement-breakpoint
CREATE TABLE "arsip"."arsip_usul_musnah" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"arsip_id" uuid NOT NULL,
	"status" text DEFAULT 'MENUNGGU' NOT NULL,
	"catatan" text,
	"diusulkan_oleh" uuid,
	"decided_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"decided_at" timestamp,
	CONSTRAINT "arsip_usul_musnah_status_check" CHECK ("arsip"."arsip_usul_musnah"."status" in ('MENUNGGU', 'DISETUJUI', 'DITOLAK'))
);
--> statement-breakpoint
ALTER TABLE "auth"."user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "auth"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master"."master_kegiatan" ADD CONSTRAINT "master_kegiatan_fungsi_id_master_fungsi_id_fk" FOREIGN KEY ("fungsi_id") REFERENCES "master"."master_fungsi"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master"."master_kategori_permintaan" ADD CONSTRAINT "master_kategori_permintaan_jenis_permintaan_id_master_jenis_permintaan_id_fk" FOREIGN KEY ("jenis_permintaan_id") REFERENCES "master"."master_jenis_permintaan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master"."master_detail_permintaan" ADD CONSTRAINT "master_detail_permintaan_kategori_permintaan_id_master_kategori_permintaan_id_fk" FOREIGN KEY ("kategori_permintaan_id") REFERENCES "master"."master_kategori_permintaan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master"."master_kelengkapan_dokumen" ADD CONSTRAINT "master_kelengkapan_dokumen_kegiatan_id_master_kegiatan_id_fk" FOREIGN KEY ("kegiatan_id") REFERENCES "master"."master_kegiatan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master"."master_kelengkapan_dokumen" ADD CONSTRAINT "master_kelengkapan_dokumen_jenis_permintaan_id_master_jenis_permintaan_id_fk" FOREIGN KEY ("jenis_permintaan_id") REFERENCES "master"."master_jenis_permintaan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master"."master_kelengkapan_dokumen" ADD CONSTRAINT "master_kelengkapan_dokumen_kategori_permintaan_id_master_kategori_permintaan_id_fk" FOREIGN KEY ("kategori_permintaan_id") REFERENCES "master"."master_kategori_permintaan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master"."master_kelengkapan_dokumen" ADD CONSTRAINT "master_kelengkapan_dokumen_detail_permintaan_id_master_detail_permintaan_id_fk" FOREIGN KEY ("detail_permintaan_id") REFERENCES "master"."master_detail_permintaan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master"."ketua_tim_assignments" ADD CONSTRAINT "ketua_tim_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master"."ketua_tim_assignments" ADD CONSTRAINT "ketua_tim_assignments_kegiatan_id_master_kegiatan_id_fk" FOREIGN KEY ("kegiatan_id") REFERENCES "master"."master_kegiatan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master"."ketua_tim_assignments" ADD CONSTRAINT "ketua_tim_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dokumen"."dokumen_transaksi" ADD CONSTRAINT "dokumen_transaksi_fungsi_id_master_fungsi_id_fk" FOREIGN KEY ("fungsi_id") REFERENCES "master"."master_fungsi"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dokumen"."dokumen_transaksi" ADD CONSTRAINT "dokumen_transaksi_kegiatan_jenis_id_master_kegiatan_id_fk" FOREIGN KEY ("kegiatan_jenis_id") REFERENCES "master"."master_kegiatan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dokumen"."dokumen_transaksi" ADD CONSTRAINT "dokumen_transaksi_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dokumen"."dokumen_transaksi" ADD CONSTRAINT "dokumen_transaksi_jenis_dokumen_id_master_jenis_dokumen_id_fk" FOREIGN KEY ("jenis_dokumen_id") REFERENCES "master"."master_jenis_dokumen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dokumen"."log_aktivitas" ADD CONSTRAINT "log_aktivitas_dokumen_id_dokumen_transaksi_id_fk" FOREIGN KEY ("dokumen_id") REFERENCES "dokumen"."dokumen_transaksi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dokumen"."log_aktivitas" ADD CONSTRAINT "log_aktivitas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arsip"."arsip" ADD CONSTRAINT "arsip_dokumen_id_dokumen_transaksi_id_fk" FOREIGN KEY ("dokumen_id") REFERENCES "dokumen"."dokumen_transaksi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arsip"."arsip" ADD CONSTRAINT "arsip_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arsip"."arsip" ADD CONSTRAINT "arsip_musnah_by_users_id_fk" FOREIGN KEY ("musnah_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arsip"."master_klasifikasi_arsip" ADD CONSTRAINT "master_klasifikasi_arsip_parent_id_master_klasifikasi_arsip_id_fk" FOREIGN KEY ("parent_id") REFERENCES "arsip"."master_klasifikasi_arsip"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arsip"."arsip_usul_musnah" ADD CONSTRAINT "arsip_usul_musnah_arsip_id_arsip_id_fk" FOREIGN KEY ("arsip_id") REFERENCES "arsip"."arsip"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arsip"."arsip_usul_musnah" ADD CONSTRAINT "arsip_usul_musnah_diusulkan_oleh_users_id_fk" FOREIGN KEY ("diusulkan_oleh") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arsip"."arsip_usul_musnah" ADD CONSTRAINT "arsip_usul_musnah_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_users_email_unique" ON "auth"."users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_auth_users_is_active" ON "auth"."users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_auth_users_deactivated_by" ON "auth"."users" USING btree ("deactivated_by");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_roles_nama_unique" ON "auth"."roles" USING btree ("nama");--> statement-breakpoint
CREATE INDEX "idx_auth_user_roles_user_id" ON "auth"."user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_auth_user_roles_role_id" ON "auth"."user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_unique" ON "auth"."sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_auth_sessions_user_id" ON "auth"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_auth_sessions_expires_at" ON "auth"."sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_auth_sessions_revoked_at" ON "auth"."sessions" USING btree ("revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "master_fungsi_nama_unique" ON "master"."master_fungsi" USING btree ("nama");--> statement-breakpoint
CREATE INDEX "idx_master_fungsi_is_active" ON "master"."master_fungsi" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_master_fungsi_nama" ON "master"."master_fungsi" USING btree ("nama");--> statement-breakpoint
CREATE INDEX "idx_master_kegiatan_fungsi_id" ON "master"."master_kegiatan" USING btree ("fungsi_id");--> statement-breakpoint
CREATE INDEX "idx_master_kegiatan_is_active" ON "master"."master_kegiatan" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_master_kegiatan_fungsi_active" ON "master"."master_kegiatan" USING btree ("fungsi_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "master_kegiatan_fungsi_id_nama_active_unique" ON "master"."master_kegiatan" USING btree ("fungsi_id","nama") WHERE "master"."master_kegiatan"."is_active" = true;--> statement-breakpoint
CREATE INDEX "idx_master_jenis_permintaan_is_active" ON "master"."master_jenis_permintaan" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_master_jenis_permintaan_nama" ON "master"."master_jenis_permintaan" USING btree ("nama");--> statement-breakpoint
CREATE UNIQUE INDEX "master_jenis_permintaan_nama_active_unique" ON "master"."master_jenis_permintaan" USING btree ("nama") WHERE "master"."master_jenis_permintaan"."is_active" = true;--> statement-breakpoint
CREATE INDEX "idx_master_kategori_permintaan_jenis_id" ON "master"."master_kategori_permintaan" USING btree ("jenis_permintaan_id");--> statement-breakpoint
CREATE INDEX "idx_master_kategori_permintaan_jenis_active" ON "master"."master_kategori_permintaan" USING btree ("jenis_permintaan_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "master_kategori_permintaan_jenis_id_nama_active_unique" ON "master"."master_kategori_permintaan" USING btree ("jenis_permintaan_id","nama") WHERE "master"."master_kategori_permintaan"."is_active" = true;--> statement-breakpoint
CREATE INDEX "idx_master_detail_permintaan_kategori_id" ON "master"."master_detail_permintaan" USING btree ("kategori_permintaan_id");--> statement-breakpoint
CREATE INDEX "idx_master_detail_permintaan_kategori_active" ON "master"."master_detail_permintaan" USING btree ("kategori_permintaan_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "master_detail_permintaan_kategori_id_nama_active_unique" ON "master"."master_detail_permintaan" USING btree ("kategori_permintaan_id","nama") WHERE "master"."master_detail_permintaan"."is_active" = true;--> statement-breakpoint
CREATE INDEX "idx_master_jenis_dokumen_is_active" ON "master"."master_jenis_dokumen" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_master_jenis_dokumen_nama" ON "master"."master_jenis_dokumen" USING btree ("nama");--> statement-breakpoint
CREATE UNIQUE INDEX "master_jenis_dokumen_nama_active_unique" ON "master"."master_jenis_dokumen" USING btree ("nama") WHERE "master"."master_jenis_dokumen"."is_active" = true;--> statement-breakpoint
CREATE INDEX "idx_master_kelengkapan_kegiatan_id" ON "master"."master_kelengkapan_dokumen" USING btree ("kegiatan_id");--> statement-breakpoint
CREATE INDEX "idx_master_kelengkapan_is_ketua_tim" ON "master"."master_kelengkapan_dokumen" USING btree ("is_ketua_tim");--> statement-breakpoint
CREATE INDEX "idx_master_kelengkapan_chain" ON "master"."master_kelengkapan_dokumen" USING btree ("kegiatan_id","is_ketua_tim","jenis_permintaan_id","kategori_permintaan_id","detail_permintaan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ketua_tim_kegiatan_unique" ON "master"."ketua_tim_assignments" USING btree ("kegiatan_id");--> statement-breakpoint
CREATE INDEX "idx_ketua_tim_user_id" ON "master"."ketua_tim_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ketua_tim_kegiatan_id" ON "master"."ketua_tim_assignments" USING btree ("kegiatan_id");--> statement-breakpoint
CREATE INDEX "idx_dokumen_transaksi_created_by" ON "dokumen"."dokumen_transaksi" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_dokumen_transaksi_created_by_status" ON "dokumen"."dokumen_transaksi" USING btree ("created_by","status");--> statement-breakpoint
CREATE INDEX "idx_dokumen_transaksi_status" ON "dokumen"."dokumen_transaksi" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_dokumen_transaksi_status_current_step" ON "dokumen"."dokumen_transaksi" USING btree ("status","current_step");--> statement-breakpoint
CREATE INDEX "idx_dokumen_transaksi_revision_target" ON "dokumen"."dokumen_transaksi" USING btree ("revision_target");--> statement-breakpoint
CREATE INDEX "idx_dokumen_transaksi_fungsi_id" ON "dokumen"."dokumen_transaksi" USING btree ("fungsi_id");--> statement-breakpoint
CREATE INDEX "idx_dokumen_transaksi_kegiatan_jenis_id" ON "dokumen"."dokumen_transaksi" USING btree ("kegiatan_jenis_id");--> statement-breakpoint
CREATE INDEX "idx_dokumen_transaksi_created_at" ON "dokumen"."dokumen_transaksi" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_dokumen_transaksi_updated_at" ON "dokumen"."dokumen_transaksi" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_dokumen_transaksi_status_updated_at" ON "dokumen"."dokumen_transaksi" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_dokumen_transaksi_laporan_saya" ON "dokumen"."dokumen_transaksi" USING btree ("created_by","tahun");--> statement-breakpoint
CREATE INDEX "idx_dokumen_transaksi_laporan_kegiatan" ON "dokumen"."dokumen_transaksi" USING btree ("kegiatan_jenis_id","tahun");--> statement-breakpoint
CREATE INDEX "idx_dokumen_transaksi_jenis_permintaan_id" ON "dokumen"."dokumen_transaksi" USING btree ("jenis_permintaan_id");--> statement-breakpoint
CREATE INDEX "idx_dokumen_transaksi_kategori_permintaan_id" ON "dokumen"."dokumen_transaksi" USING btree ("kategori_permintaan_id");--> statement-breakpoint
CREATE INDEX "idx_dokumen_transaksi_detail_permintaan_id" ON "dokumen"."dokumen_transaksi" USING btree ("detail_permintaan_id");--> statement-breakpoint
CREATE INDEX "log_aktivitas_dokumen_id_idx" ON "dokumen"."log_aktivitas" USING btree ("dokumen_id");--> statement-breakpoint
CREATE INDEX "log_aktivitas_user_id_idx" ON "dokumen"."log_aktivitas" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_log_aktivitas_dokumen_timestamp" ON "dokumen"."log_aktivitas" USING btree ("dokumen_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_log_aktivitas_dokumen_aksi" ON "dokumen"."log_aktivitas" USING btree ("dokumen_id","aksi");--> statement-breakpoint
CREATE INDEX "idx_arsip_status_arsip" ON "arsip"."arsip" USING btree ("status_arsip");--> statement-breakpoint
CREATE INDEX "idx_arsip_dokumen_id" ON "arsip"."arsip" USING btree ("dokumen_id");--> statement-breakpoint
CREATE INDEX "idx_arsip_masa_aktif_berakhir" ON "arsip"."arsip" USING btree ("masa_aktif_berakhir") WHERE "arsip"."arsip"."status_arsip" = 'AKTIF';--> statement-breakpoint
CREATE INDEX "idx_arsip_masa_inaktif_berakhir" ON "arsip"."arsip" USING btree ("masa_inaktif_berakhir") WHERE "arsip"."arsip"."status_arsip" = 'INAKTIF';--> statement-breakpoint
CREATE INDEX "idx_arsip_archived_at" ON "arsip"."arsip" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "idx_arsip_musnah_by" ON "arsip"."arsip" USING btree ("musnah_by");--> statement-breakpoint
CREATE UNIQUE INDEX "master_klasifikasi_arsip_nama_unique" ON "arsip"."master_klasifikasi_arsip" USING btree ("nama");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_master_klasifikasi_kode_unique" ON "arsip"."master_klasifikasi_arsip" USING btree ("kode") WHERE "arsip"."master_klasifikasi_arsip"."kode" is not null;--> statement-breakpoint
CREATE INDEX "idx_master_klasifikasi_active" ON "arsip"."master_klasifikasi_arsip" USING btree ("is_active") WHERE "arsip"."master_klasifikasi_arsip"."is_active" = true;--> statement-breakpoint
CREATE INDEX "idx_master_klasifikasi_parent_id" ON "arsip"."master_klasifikasi_arsip" USING btree ("parent_id") WHERE "arsip"."master_klasifikasi_arsip"."parent_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "arsip_usul_musnah_arsip_id_unique" ON "arsip"."arsip_usul_musnah" USING btree ("arsip_id");--> statement-breakpoint
CREATE INDEX "idx_arsip_usul_musnah_arsip_id" ON "arsip"."arsip_usul_musnah" USING btree ("arsip_id");--> statement-breakpoint
CREATE INDEX "idx_arsip_usul_musnah_status" ON "arsip"."arsip_usul_musnah" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_arsip_usul_musnah_diusulkan_oleh" ON "arsip"."arsip_usul_musnah" USING btree ("diusulkan_oleh");--> statement-breakpoint
CREATE INDEX "idx_arsip_usul_musnah_created_at" ON "arsip"."arsip_usul_musnah" USING btree ("created_at");