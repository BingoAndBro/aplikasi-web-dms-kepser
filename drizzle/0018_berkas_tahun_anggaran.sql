-- 0018_berkas_tahun_anggaran
-- A klasifikasi is no longer usable for exactly one berkas over its whole
-- lifetime. Revolving payment cycles (UP/TUP) reset every fiscal year, so the
-- open/closed berkas per klasifikasi must now be scoped per tahun_anggaran:
-- once "UP-3 / TA 2026" is closed, "UP-3 / TA 2027" can still be opened.
-- klasifikasi itself stays evergreen (no per-year rows).

ALTER TABLE "arsip"."berkas_arsip" ADD COLUMN IF NOT EXISTS "tahun_anggaran" integer;
--> statement-breakpoint

-- Backfill from created_at in local time. Safe: the previous rule guaranteed
-- at most one berkas per klasifikasi, so no collisions can occur here.
UPDATE "arsip"."berkas_arsip"
SET "tahun_anggaran" = EXTRACT(YEAR FROM "created_at" AT TIME ZONE 'Asia/Jakarta')::int
WHERE "tahun_anggaran" IS NULL;
--> statement-breakpoint

ALTER TABLE "arsip"."berkas_arsip" ALTER COLUMN "tahun_anggaran" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "arsip"."berkas_arsip" ADD CONSTRAINT "berkas_arsip_tahun_anggaran_check"
  CHECK ("tahun_anggaran" between 2000 and 2100);
--> statement-breakpoint

DROP INDEX IF EXISTS "arsip"."berkas_arsip_open_klasifikasi_unique";
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "berkas_arsip_klasifikasi_tahun_unique" ON "arsip"."berkas_arsip" USING btree ("klasifikasi_id", "tahun_anggaran");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_berkas_arsip_tahun_anggaran" ON "arsip"."berkas_arsip" USING btree ("tahun_anggaran");
