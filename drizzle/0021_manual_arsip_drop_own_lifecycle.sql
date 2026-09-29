-- 0021_manual_arsip_drop_own_lifecycle (D-29)
-- Status arsip dokumen tambahan KSBU mengikuti status arsip BERKAS yang
-- menaunginya (lihat src/lib/archive/manual-arsip-effective-status.ts), sama
-- seperti dokumen alur pengajuan yang memang tidak punya kolom status arsip.
-- Kolom siklus hidup milik manual_arsip sendiri tidak pernah diperbarui oleh
-- kode mana pun setelah baris dibuat, sehingga bisa berbeda dari berkasnya
-- (contoh nyata: dokumen di berkas DIMUSNAHKAN masih tercatat AKTIF).
-- Dicek sebelum dihapus (DB lokal, 2026-09-29): 5 dari 5 baris berstatus
-- AKTIF, 0 baris mengisi kolom inactivated/proposed_destroy/destroyed, dan
-- tidak ada view yang memakai kolom-kolom ini.

ALTER TABLE "arsip"."manual_arsip" DROP CONSTRAINT IF EXISTS "manual_arsip_status_arsip_check";
--> statement-breakpoint

DROP INDEX IF EXISTS "arsip"."idx_manual_arsip_status_arsip";
--> statement-breakpoint

ALTER TABLE "arsip"."manual_arsip" DROP CONSTRAINT IF EXISTS "manual_arsip_inactivated_by_users_id_fk";
--> statement-breakpoint

ALTER TABLE "arsip"."manual_arsip" DROP CONSTRAINT IF EXISTS "manual_arsip_proposed_destroy_by_users_id_fk";
--> statement-breakpoint

ALTER TABLE "arsip"."manual_arsip" DROP CONSTRAINT IF EXISTS "manual_arsip_destroyed_by_users_id_fk";
--> statement-breakpoint

ALTER TABLE "arsip"."manual_arsip"
  DROP COLUMN IF EXISTS "status_arsip",
  DROP COLUMN IF EXISTS "inactivated_at",
  DROP COLUMN IF EXISTS "inactivated_by",
  DROP COLUMN IF EXISTS "proposed_destroy_at",
  DROP COLUMN IF EXISTS "proposed_destroy_by",
  DROP COLUMN IF EXISTS "destroyed_at",
  DROP COLUMN IF EXISTS "destroyed_by";
