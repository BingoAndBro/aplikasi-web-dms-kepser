-- 0014_rename_bendahara_role_to_ppspm
-- Full internal rename of the BENDAHARA role to PPSPM (previously only the
-- display label was PPSPM; see docs/migration/_archive/phase-13c-ppspm-display-rename.md).
-- Data-only migration, same pattern as 0001_rename_arsiparis_role.sql.
--
-- log_aktivitas.aksi is intentionally NOT touched here: that table is
-- append-only by application contract, so historical BENDAHARA_APPROVE /
-- BENDAHARA_REJECT rows keep their original literal forever (the UI has a
-- legacy fallback for them in ActivityLog.tsx).

UPDATE "auth"."roles"
SET
	"nama" = 'PPSPM',
	"description" = 'PPSPM pemeriksa dan penyelesai dokumen',
	"updated_at" = now()
WHERE "nama" = 'BENDAHARA';
--> statement-breakpoint

UPDATE "dokumen"."dokumen_transaksi"
SET "status" = 'IN_PPSPM_APPROVAL'
WHERE "status" = 'IN_BENDAHARA_APPROVAL';
--> statement-breakpoint

UPDATE "dokumen"."dokumen_transaksi"
SET "current_step" = 'PPSPM'
WHERE "current_step" = 'BENDAHARA';
