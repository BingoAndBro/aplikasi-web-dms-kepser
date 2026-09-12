-- Domain schemas for the local PostgreSQL migration foundation.
-- These schemas separate auth, master data, document workflow, archive, and app-owned objects.
-- Schema names are for domain organization only; they are not an authorization boundary.
-- API/server handlers remain the source of truth for authorization decisions.
-- PostgreSQL RLS is intentionally deferred for the first migration phases.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS master;
CREATE SCHEMA IF NOT EXISTS dokumen;
CREATE SCHEMA IF NOT EXISTS arsip;
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS audit;
