-- 0023_laporan_tautan_akses
-- Tautan Laporan punya dua jenis akses: LOGIN (pembuka wajib login, perilaku
-- 0022) dan PUBLIK (siapa pun yang memegang tautan, tanpa akun). Baris yang
-- sudah ada tetap LOGIN. Lihat src/lib/laporan/tautan.ts.

ALTER TABLE "app"."laporan_tautan"
	ADD COLUMN IF NOT EXISTS "akses" text DEFAULT 'LOGIN' NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'laporan_tautan_akses_check'
			AND conrelid = 'app.laporan_tautan'::regclass
	) THEN
		ALTER TABLE "app"."laporan_tautan"
		ADD CONSTRAINT "laporan_tautan_akses_check"
		CHECK ("app"."laporan_tautan"."akses" in ('LOGIN', 'PUBLIK'));
	END IF;
END $$;
