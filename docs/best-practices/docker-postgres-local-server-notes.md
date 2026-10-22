# Docker PostgreSQL Local Server Notes

## Official PostgreSQL Image

Use the official `postgres` image for local PostgreSQL. Configure:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- Persistent data volume.

The official image initializes the database only when the data directory is empty. Changing initialization env vars later does not rewrite an existing volume.

## Docker Compose

Compose should eventually define PostgreSQL as a service with:

- Explicit image tag.
- Persistent named volume.
- Healthcheck using `pg_isready`.
- Environment loaded from a local env file.
- Optional localhost-only port publishing for developer access.

If the app is later containerized, it should depend on the database service being healthy.

## Volumes

Use a named Docker volume for PostgreSQL data. Compose volumes are persistent data stores managed by Docker and reused between `docker compose up` runs.

Planning rule:

- Database volume stores PostgreSQL data.
- App `storage/` stores uploaded files separately.
- Backup routines must cover both.

## Healthcheck

Use a healthcheck so dependent services do not start before PostgreSQL is ready. Docker Compose supports `depends_on` with `condition: service_healthy`.

## Init Scripts

Init scripts are useful for first-time setup only:

- Create schemas.
- Create extensions.
- Create initial database roles if needed.

Do not put routine migrations in one-time init scripts. Use Drizzle migrations for schema evolution.

## Backup And Restore

PostgreSQL backups:

- Use `pg_dump` for database backup.
- Prefer custom format for flexible restore when practical.
- Use `pg_restore` for custom-format restore.

File backups:

- Archive `storage/` alongside the database dump.
- Keep DB dump and files from the same point in time together.

Restore checks:

- Database restores successfully.
- Storage files restore to expected path.
- Preview/download can find files referenced by DB rows.

## Local Server And LAN Considerations

- Publish only the app port to LAN.
- Keep PostgreSQL private to localhost or Docker network unless needed.
- Docker published ports bind broadly by default if no host address is specified.
- Use firewall rules to restrict access to trusted networks.

## References

- Docker Postgres image: https://hub.docker.com/_/postgres
- Docker Compose volumes: https://docs.docker.com/reference/compose-file/volumes/
- Docker Compose services and healthcheck: https://docs.docker.com/reference/compose-file/services/
- Docker Compose networking: https://docs.docker.com/compose/how-tos/networking/
- Docker port publishing: https://docs.docker.com/engine/network/port-publishing/
- PostgreSQL `pg_dump`: https://www.postgresql.org/docs/17/app-pgdump.html
- PostgreSQL `pg_restore`: https://www.postgresql.org/docs/current/app-pgrestore.html

