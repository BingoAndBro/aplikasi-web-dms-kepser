-- 0024_google_drive_tautan
-- Tautan Laporan berakses DRIVE: salinan lampiran disimpan di folder Google
-- Drive akun yang dihubungkan ADMIN, lalu dibagikan lewat link folder itu.
-- Menambah tabel akun Google (app.google_drive_akun), baris lampiran yang
-- disalin (app.laporan_tautan_drive_file), antrean kerja runner
-- (app.drive_job), kolom drive_* pada app.laporan_tautan, serta entity type
-- dan aksi audit Drive. Ditulis tangan dan idempoten (aman dijalankan ulang).
-- Lihat src/db/schema/app/{google-drive-akun,laporan-tautan,laporan-tautan-drive-file,drive-job}.ts
-- dan src/lib/google-drive/.

CREATE TABLE IF NOT EXISTS "app"."google_drive_akun" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"refresh_token_enc" text,
	"root_folder_id" text,
	"status" text NOT NULL,
	"perlu_hubung_ulang_sejak" timestamp with time zone,
	"dihubungkan_oleh" uuid NOT NULL,
	"dihubungkan_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"dinonaktifkan_pada" timestamp with time zone,
	"diputus_oleh" uuid,
	"diputus_pada" timestamp with time zone,
	CONSTRAINT "google_drive_akun_status_check" CHECK ("app"."google_drive_akun"."status" in ('AKTIF', 'NONAKTIF', 'DIPUTUS'))
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'google_drive_akun_dihubungkan_oleh_users_id_fk'
			AND conrelid = 'app.google_drive_akun'::regclass
	) THEN
		ALTER TABLE "app"."google_drive_akun"
		ADD CONSTRAINT "google_drive_akun_dihubungkan_oleh_users_id_fk"
		FOREIGN KEY ("dihubungkan_oleh")
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
		WHERE conname = 'google_drive_akun_diputus_oleh_users_id_fk'
			AND conrelid = 'app.google_drive_akun'::regclass
	) THEN
		ALTER TABLE "app"."google_drive_akun"
		ADD CONSTRAINT "google_drive_akun_diputus_oleh_users_id_fk"
		FOREIGN KEY ("diputus_oleh")
		REFERENCES "auth"."users"("id")
		ON DELETE no action
		ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
-- Hanya satu akun AKTIF.
CREATE UNIQUE INDEX IF NOT EXISTS "google_drive_akun_satu_aktif"
	ON "app"."google_drive_akun" USING btree ("status")
	WHERE "status" = 'AKTIF';
--> statement-breakpoint
-- Satu baris per email selama belum DIPUTUS.
CREATE UNIQUE INDEX IF NOT EXISTS "google_drive_akun_email_belum_diputus"
	ON "app"."google_drive_akun" USING btree ("email")
	WHERE "status" <> 'DIPUTUS';
--> statement-breakpoint

ALTER TABLE "app"."laporan_tautan"
	ADD COLUMN IF NOT EXISTS "drive_akun_id" uuid;
--> statement-breakpoint
ALTER TABLE "app"."laporan_tautan"
	ADD COLUMN IF NOT EXISTS "drive_folder_id" text;
--> statement-breakpoint
ALTER TABLE "app"."laporan_tautan"
	ADD COLUMN IF NOT EXISTS "drive_folder_url" text;
--> statement-breakpoint
ALTER TABLE "app"."laporan_tautan"
	ADD COLUMN IF NOT EXISTS "drive_status" text;
--> statement-breakpoint
ALTER TABLE "app"."laporan_tautan"
	ADD COLUMN IF NOT EXISTS "drive_daftar_isi_file_id" text;
--> statement-breakpoint
ALTER TABLE "app"."laporan_tautan"
	ADD COLUMN IF NOT EXISTS "drive_folder_dicoba_pada" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "app"."laporan_tautan"
	ADD COLUMN IF NOT EXISTS "drive_dokumen_dilewati" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'laporan_tautan_drive_akun_id_google_drive_akun_id_fk'
			AND conrelid = 'app.laporan_tautan'::regclass
	) THEN
		ALTER TABLE "app"."laporan_tautan"
		ADD CONSTRAINT "laporan_tautan_drive_akun_id_google_drive_akun_id_fk"
		FOREIGN KEY ("drive_akun_id")
		REFERENCES "app"."google_drive_akun"("id")
		ON DELETE restrict
		ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
-- Nilai akses bertambah DRIVE: check lama dibuang lalu ditambah ulang.
ALTER TABLE "app"."laporan_tautan" DROP CONSTRAINT IF EXISTS "laporan_tautan_akses_check";
--> statement-breakpoint
ALTER TABLE "app"."laporan_tautan"
	ADD CONSTRAINT "laporan_tautan_akses_check"
	CHECK ("app"."laporan_tautan"."akses" in ('LOGIN', 'PUBLIK', 'DRIVE'));
--> statement-breakpoint
-- Kolom drive_akun_id dan drive_status terisi jika dan hanya jika akses DRIVE.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'laporan_tautan_drive_check'
			AND conrelid = 'app.laporan_tautan'::regclass
	) THEN
		ALTER TABLE "app"."laporan_tautan"
		ADD CONSTRAINT "laporan_tautan_drive_check"
		CHECK (("app"."laporan_tautan"."akses" = 'DRIVE') = ("app"."laporan_tautan"."drive_akun_id" IS NOT NULL AND "app"."laporan_tautan"."drive_status" IS NOT NULL));
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'laporan_tautan_drive_status_check'
			AND conrelid = 'app.laporan_tautan'::regclass
	) THEN
		ALTER TABLE "app"."laporan_tautan"
		ADD CONSTRAINT "laporan_tautan_drive_status_check"
		CHECK ("app"."laporan_tautan"."drive_status" IS NULL OR "app"."laporan_tautan"."drive_status" in ('MENUNGGU', 'MENGUNGGAH', 'SIAP', 'GAGAL', 'MENGHAPUS', 'DIHAPUS'));
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_laporan_tautan_drive_akun"
	ON "app"."laporan_tautan" USING btree ("drive_akun_id");
--> statement-breakpoint

-- dokumen_id, manual_arsip_id, attachment_id SENGAJA tanpa FK: baris harus
-- bertahan setelah dokumennya dihapus permanen agar salinan di Drive tetap
-- bisa dihapus runner.
CREATE TABLE IF NOT EXISTS "app"."laporan_tautan_drive_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tautan_id" uuid NOT NULL,
	"sumber" text NOT NULL,
	"dokumen_id" uuid,
	"lampiran_index" integer,
	"manual_arsip_id" uuid,
	"attachment_id" uuid,
	"kunci_lampiran" text NOT NULL,
	"nama_file" text NOT NULL,
	"label_dokumen" text NOT NULL,
	"urutan" integer NOT NULL,
	"content_type" text NOT NULL,
	"drive_file_id" text,
	"status" text DEFAULT 'MENUNGGU' NOT NULL,
	"keterangan_hapus" text,
	"dicoba_pada" timestamp with time zone,
	"diunggah_pada" timestamp with time zone,
	"dihapus_pada" timestamp with time zone,
	CONSTRAINT "laporan_tautan_drive_file_kunci_unique" UNIQUE("tautan_id","kunci_lampiran"),
	CONSTRAINT "laporan_tautan_drive_file_sumber_check" CHECK ("app"."laporan_tautan_drive_file"."sumber" in ('DOKUMEN', 'MANUAL_ARSIP')),
	CONSTRAINT "laporan_tautan_drive_file_status_check" CHECK ("app"."laporan_tautan_drive_file"."status" in ('MENUNGGU', 'TERUNGGAH', 'MENGHAPUS', 'DIHAPUS', 'DILEWATI')),
	CONSTRAINT "laporan_tautan_drive_file_keterangan_hapus_check" CHECK ("app"."laporan_tautan_drive_file"."keterangan_hapus" IS NULL OR "app"."laporan_tautan_drive_file"."keterangan_hapus" in ('DICABUT', 'DIMUSNAHKAN', 'DIBERSIHKAN', 'DIHAPUS_PEMILIK')),
	CONSTRAINT "laporan_tautan_drive_file_sumber_kolom_check" CHECK (("app"."laporan_tautan_drive_file"."sumber" <> 'DOKUMEN' OR ("app"."laporan_tautan_drive_file"."dokumen_id" IS NOT NULL AND "app"."laporan_tautan_drive_file"."lampiran_index" IS NOT NULL))
		AND ("app"."laporan_tautan_drive_file"."sumber" <> 'MANUAL_ARSIP' OR ("app"."laporan_tautan_drive_file"."manual_arsip_id" IS NOT NULL AND "app"."laporan_tautan_drive_file"."attachment_id" IS NOT NULL)))
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'laporan_tautan_drive_file_tautan_id_laporan_tautan_id_fk'
			AND conrelid = 'app.laporan_tautan_drive_file'::regclass
	) THEN
		ALTER TABLE "app"."laporan_tautan_drive_file"
		ADD CONSTRAINT "laporan_tautan_drive_file_tautan_id_laporan_tautan_id_fk"
		FOREIGN KEY ("tautan_id")
		REFERENCES "app"."laporan_tautan"("id")
		ON DELETE no action
		ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_laporan_tautan_drive_file_dokumen"
	ON "app"."laporan_tautan_drive_file" USING btree ("dokumen_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_laporan_tautan_drive_file_manual_arsip"
	ON "app"."laporan_tautan_drive_file" USING btree ("manual_arsip_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_laporan_tautan_drive_file_tautan_status"
	ON "app"."laporan_tautan_drive_file" USING btree ("tautan_id", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "app"."drive_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jenis" text NOT NULL,
	"akun_id" uuid NOT NULL,
	"tautan_id" uuid NOT NULL,
	"prioritas" integer NOT NULL,
	"status" text NOT NULL,
	"percobaan" integer DEFAULT 0 NOT NULL,
	"jadwal_berikut" timestamp with time zone DEFAULT now() NOT NULL,
	"dikunci_pada" timestamp with time zone,
	"galat_kategori" text,
	"galat_pesan" text,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"selesai_pada" timestamp with time zone,
	CONSTRAINT "drive_job_jenis_check" CHECK ("app"."drive_job"."jenis" in ('SINKRON_TAUTAN', 'HAPUS_TAUTAN', 'HAPUS_FILE')),
	CONSTRAINT "drive_job_status_check" CHECK ("app"."drive_job"."status" in ('MENUNGGU', 'PROSES', 'SELESAI', 'GAGAL', 'DIBATALKAN')),
	CONSTRAINT "drive_job_galat_kategori_check" CHECK ("app"."drive_job"."galat_kategori" IS NULL OR "app"."drive_job"."galat_kategori" in ('SEMENTARA', 'TOKEN_TIDAK_VALID', 'KUOTA_PENUH', 'TIDAK_DITEMUKAN', 'PERMANEN', 'AKUN_DIPUTUS'))
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'drive_job_akun_id_google_drive_akun_id_fk'
			AND conrelid = 'app.drive_job'::regclass
	) THEN
		ALTER TABLE "app"."drive_job"
		ADD CONSTRAINT "drive_job_akun_id_google_drive_akun_id_fk"
		FOREIGN KEY ("akun_id")
		REFERENCES "app"."google_drive_akun"("id")
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
		WHERE conname = 'drive_job_tautan_id_laporan_tautan_id_fk'
			AND conrelid = 'app.drive_job'::regclass
	) THEN
		ALTER TABLE "app"."drive_job"
		ADD CONSTRAINT "drive_job_tautan_id_laporan_tautan_id_fk"
		FOREIGN KEY ("tautan_id")
		REFERENCES "app"."laporan_tautan"("id")
		ON DELETE no action
		ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drive_job_antrean"
	ON "app"."drive_job" USING btree ("status", "prioritas", "jadwal_berikut");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drive_job_tautan"
	ON "app"."drive_job" USING btree ("tautan_id");
--> statement-breakpoint
-- Satu job MENUNGGU per (tautan, jenis); enqueue kedua memajukan jadwal (ON CONFLICT).
CREATE UNIQUE INDEX IF NOT EXISTS "drive_job_satu_menunggu"
	ON "app"."drive_job" USING btree ("tautan_id", "jenis")
	WHERE "status" = 'MENUNGGU';
--> statement-breakpoint

-- Audit: entity type dan aksi Drive. Check lama dibuang lalu ditambah ulang.
ALTER TABLE "audit"."audit_log" DROP CONSTRAINT IF EXISTS "audit_log_entity_type_check";
--> statement-breakpoint
ALTER TABLE "audit"."audit_log"
	ADD CONSTRAINT "audit_log_entity_type_check"
	CHECK ("audit"."audit_log"."entity_type" in ('DOKUMEN', 'GOOGLE_DRIVE_AKUN', 'LAPORAN_TAUTAN'));
--> statement-breakpoint
ALTER TABLE "audit"."audit_log" DROP CONSTRAINT IF EXISTS "audit_log_aksi_check";
--> statement-breakpoint
ALTER TABLE "audit"."audit_log"
	ADD CONSTRAINT "audit_log_aksi_check"
	CHECK ("audit"."audit_log"."aksi" in (
		'DOKUMEN_LAMPIRAN_DIBERSIHKAN',
		'DOKUMEN_DIHAPUS_PERMANEN',
		'BERKAS_LAMPIRAN_DIBERSIHKAN',
		'DRIVE_AKUN_DIHUBUNGKAN',
		'DRIVE_AKUN_DINONAKTIFKAN',
		'DRIVE_AKUN_DIPUTUS',
		'DRIVE_TAUTAN_SIAP',
		'DRIVE_TAUTAN_DIHAPUS',
		'DRIVE_FILE_DIHAPUS'
	));
