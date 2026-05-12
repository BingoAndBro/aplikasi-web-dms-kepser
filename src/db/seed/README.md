# Local PostgreSQL Seed Foundation

This folder contains the Phase 3G seed foundation for the local PostgreSQL migration.

It is intentionally not wired into runtime behavior and should not be run automatically.

Seed scope:

- canonical role rows in `auth.roles`
- optional development users in `auth.users`
- optional development user-role joins in `auth.user_roles`
- minimal master data needed to create a valid document later
- one archive classification for later archive testing
- one Ketua Tim fixture only when development users are seeded

Development user seeding is disabled unless `DMS_DEV_SEED_PASSWORD_HASH` is set to an argon2id hash. Plaintext passwords are never stored in seed files.

Do not use these fixture identities or deterministic IDs in production.
