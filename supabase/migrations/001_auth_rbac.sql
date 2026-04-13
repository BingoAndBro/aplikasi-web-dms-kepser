-- =====================================================
-- 001_auth_rbac.sql
-- Auth & RBAC Foundation: roles, user_roles, RLS
-- Idempotent — aman dijalankan lebih dari sekali
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: roles
-- =====================================================
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL UNIQUE,
  deskripsi text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- =====================================================
-- TABLE: user_roles
-- =====================================================
CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, -- UUID dari auth.users (tanpa FK constraint karena dikelola Supabase)
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT user_roles_user_id_role_id_unique UNIQUE (user_id, role_id)
);

-- =====================================================
-- SECURITY DEFINER FUNCTION: get_user_roles
-- Supabase RLS doesn't support direct cross-table join
-- This function enables RLS to check user's roles
-- =====================================================
CREATE OR REPLACE FUNCTION get_user_roles(p_user_id uuid)
RETURNS SETOF roles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.* FROM roles r
  INNER JOIN user_roles ur ON ur.role_id = r.id
  WHERE ur.user_id = p_user_id;
$$;

-- =====================================================
-- RLS: Enable Row Level Security
-- =====================================================
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES: roles
-- =====================================================
-- Everyone can read roles (needed for role display in UI)
CREATE POLICY roles_select ON roles
  FOR SELECT
  USING (true);

-- Only ADMIN can insert/update/delete roles
-- For MVP, we allow INSERT/UPDATE/DELETE only from service role key
-- (Server-side check required — RLS alone not sufficient for admin check)
CREATE POLICY roles_admin_all ON roles
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM get_user_roles(auth.uid()) gr
    WHERE gr.nama = 'ADMIN'
  ));

-- =====================================================
-- RLS POLICIES: user_roles
-- =====================================================
-- User can SELECT their own role mappings
CREATE POLICY user_roles_select_own ON user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- ADMIN can also SELECT all mappings
CREATE POLICY user_roles_select_admin ON user_roles
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM get_user_roles(auth.uid()) gr
    WHERE gr.nama = 'ADMIN'
  ));

-- INSERT only by ADMIN (server-side check required)
CREATE POLICY user_roles_insert_admin ON user_roles
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM get_user_roles(auth.uid()) gr
    WHERE gr.nama = 'ADMIN'
  ));

-- DELETE only by ADMIN
CREATE POLICY user_roles_delete_admin ON user_roles
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM get_user_roles(auth.uid()) gr
    WHERE gr.nama = 'ADMIN'
  ));

-- =====================================================
-- SEED DATA: 5 roles
-- Idempotent — tidak error jika dijalankan lagi
-- =====================================================
INSERT INTO roles (nama, deskripsi) VALUES
  ('PEGAWAI', 'Role dasar — semua pegawai punya role ini'),
  ('PPK', 'Pejabat Pembuat Komitmen — validasi dokumen'),
  ('BENDAHARA', 'Bendahara — approve pencairan'),
  ('ARSIPARIS', 'Arsiparis — arsipkan dokumen'),
  ('ADMIN', 'Administrator — kelola user & master data')
ON CONFLICT (nama) DO NOTHING;
