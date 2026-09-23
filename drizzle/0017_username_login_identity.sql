-- 0017_username_login_identity
-- Replaces email as the login identity with a free-form username, and adds
-- nip_nrp as a second login identifier. Login now resolves ONE identifier
-- against username OR nip_nrp; the two namespaces must never collide, which
-- is why username is required to contain at least one letter (nip_nrp is
-- numeric-only, /^\d{8,20}$/, enforced at the application layer).
-- email is kept as optional contact info: nullable, no longer unique, not
-- used for login. This app never sends email (no mailer dependency exists),
-- so the .email() format constraint was pure friction.

ALTER TABLE "auth"."users" ADD COLUMN IF NOT EXISTS "username" text;
--> statement-breakpoint

-- Backfill username from the email local-part. Characters outside
-- [a-z0-9._-] are stripped (not rejected); an all-digit local-part gets a
-- 'u' prefix so it can never collide with the nip_nrp namespace; empty/NULL
-- email falls back to 'user'; results under 3 chars are padded with 'x'.
-- Base is capped at 24 chars to leave room for a collision suffix.
WITH cleaned AS (
  SELECT id, created_at,
         regexp_replace(lower(split_part(coalesce(email, ''), '@', 1)),
                        '[^a-z0-9._-]', '', 'g') AS raw
  FROM auth.users
), candidate AS (
  SELECT id, created_at,
         CASE
           WHEN raw = '' THEN 'user'
           WHEN left(raw, 24) ~ '[a-z]' THEN left(raw, 24)
           ELSE 'u' || left(raw, 23)
         END AS base
  FROM cleaned
), sized AS (
  SELECT id, created_at,
         CASE WHEN length(base) < 3 THEN rpad(base, 3, 'x') ELSE base END AS base
  FROM candidate
), numbered AS (
  SELECT id, base,
         row_number() OVER (PARTITION BY base ORDER BY created_at, id) AS rn
  FROM sized
)
UPDATE auth.users u
SET username = CASE WHEN n.rn = 1 THEN n.base ELSE n.base || n.rn::text END
FROM numbered n
WHERE u.id = n.id;
--> statement-breakpoint

ALTER TABLE "auth"."users" ALTER COLUMN "username" SET NOT NULL;
--> statement-breakpoint

-- Keep in sync with isValidUsername() in src/lib/types/user.ts.
ALTER TABLE "auth"."users" ADD CONSTRAINT "auth_users_username_format_check"
  CHECK (username ~ '^[a-z0-9._-]{3,30}$' AND username ~ '[a-z]');
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "auth_users_username_unique" ON "auth"."users" USING btree ("username");
--> statement-breakpoint

-- Normalize blank/whitespace NIP to NULL so it never collides under the
-- unique index below (Postgres allows any number of NULLs in a unique index).
UPDATE auth.users SET nip_nrp = NULLIF(btrim(nip_nrp), '');
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "auth_users_nip_nrp_unique" ON "auth"."users" USING btree ("nip_nrp");
--> statement-breakpoint

DROP INDEX IF EXISTS "auth"."auth_users_email_unique";
--> statement-breakpoint

ALTER TABLE "auth"."users" ALTER COLUMN "email" DROP NOT NULL;
--> statement-breakpoint

UPDATE auth.users SET email = NULLIF(btrim(lower(email)), '');
