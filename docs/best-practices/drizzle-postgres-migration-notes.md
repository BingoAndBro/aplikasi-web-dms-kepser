# Drizzle PostgreSQL Migration Notes

## Migration Strategy

Use Drizzle in codebase-first mode for the new local PostgreSQL schema. Preserve behavior while keeping the PostgreSQL schema clean and explicit.

Guidance:

- Generate SQL migrations from reviewed Drizzle schema changes.
- Review generated SQL before applying.
- Do not use direct push as the production migration path.
- Keep migration files in version control.
- Keep schema and migration table configuration explicit.

## Schema Organization

Use PostgreSQL schemas for domain separation:

- `auth`
- `master`
- `dokumen`
- `arsip`
- `app`

Drizzle supports PostgreSQL schemas through `pgSchema`, and generated queries qualify tables with the schema name.

Recommended organization:

- Group Drizzle schema files by domain.
- Export a single schema index for the Drizzle client.
- Keep enums close to the domain that owns them.
- Use explicit foreign key indexes for frequently joined columns.
- Use timestamp with timezone for time-sensitive columns.

## Multi-Schema PostgreSQL

PostgreSQL schemas are namespaces inside a database. They help organize objects and avoid name collisions, but they are not strict security boundaries by themselves. Privileges and application authorization still matter.

Migration implication:

- Use schemas (`auth`, `master`, `dokumen`, `arsip`, `audit`, `app`) for clarity.
- Do not rely on schema names as authorization.
- Qualify table references consistently.
- Decide `search_path` deliberately if any raw SQL is used.

## Seed Strategy

Seeds should be deterministic and minimal:

- Roles.
- Bootstrap admin account.
- Required master data.
- Small workflow fixtures only if needed for tests.

If realistic test data is needed later, create seed scripts that are explicit, repeatable, and safe to reset.

## Avoiding Behavior Drift

Before migrating an endpoint:

- Capture current request shape.
- Capture current response shape.
- Capture role/authorization behavior.
- Capture empty/error behavior.
- Capture date/status naming behavior.

Prefer read-only endpoint migration before mutation migration. Use transactions for write flows involving documents, files, and audit logs.

## References

- Drizzle migrations: https://orm.drizzle.team/docs/migrations
- Drizzle config: https://orm.drizzle.team/docs/drizzle-config-file
- Drizzle schemas: https://orm.drizzle.team/docs/schemas
- Drizzle PostgreSQL: https://orm.drizzle.team/docs/get-started-postgresql
- Drizzle seed: https://orm.drizzle.team/docs/seed-overview
- PostgreSQL schemas: https://www.postgresql.org/docs/17/ddl-schemas.html

