-- 0015_app_settings_theme
-- Fase 6 (docs/planning/tema-global/rencana.md §6.3): persistence for the
-- GLOBAL admin-controlled theme setting. Simple key/value table for app-wide
-- settings; first row seeds the theme at "se" (current default).

CREATE SCHEMA IF NOT EXISTS "app";
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "app"."app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint

INSERT INTO "app"."app_settings" ("key", "value")
VALUES ('theme', '"se"'::jsonb)
ON CONFLICT ("key") DO NOTHING;
