ALTER TABLE "arsip"."berkas_arsip_item" DROP CONSTRAINT IF EXISTS "berkas_arsip_item_canonical_arsip_id_arsip_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "arsip"."idx_berkas_arsip_item_canonical_arsip_id";
--> statement-breakpoint
ALTER TABLE "arsip"."berkas_arsip_item" DROP COLUMN IF EXISTS "canonical_arsip_id";
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip" DROP CONSTRAINT IF EXISTS "manual_arsip_canonical_arsip_id_arsip_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "arsip"."manual_arsip_canonical_arsip_id_unique";
--> statement-breakpoint
ALTER TABLE "arsip"."manual_arsip" DROP COLUMN IF EXISTS "canonical_arsip_id";
--> statement-breakpoint
DROP TABLE IF EXISTS "arsip"."arsip_usul_musnah";
--> statement-breakpoint
DROP TABLE IF EXISTS "arsip"."arsip";
