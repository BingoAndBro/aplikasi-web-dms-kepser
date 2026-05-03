-- SPEC 07: Chairman Assignment - Database Migration
-- Section 01: Create ketua_tim_assignments table
--
-- This table tracks which users are assigned as "Ketua Tim" (Chairman) for each kegiatan.
-- Constraint: 1 kegiatan = 1 chairman (unique kegiatan_id)
-- 1 user can be chairman of unlimited kegiatan

-- Create table
CREATE TABLE IF NOT EXISTS ketua_tim_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kegiatan_id uuid NOT NULL REFERENCES master_kegiatan(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  CONSTRAINT ketua_tim_kegiatan_unique UNIQUE (kegiatan_id)
);

COMMENT ON TABLE ketua_tim_assignments IS 'Assignment user sebagai Ketua Tim pada kegiatan tertentu. 1 kegiatan = 1 chairman, 1 user = unlimited chairman assignments.';
COMMENT ON COLUMN ketua_tim_assignments.user_id IS 'User yang ditunjuk sebagai chairman';
COMMENT ON COLUMN ketua_tim_assignments.kegiatan_id IS 'Kegiatan dimana user ditunjuk sebagai chairman';
COMMENT ON COLUMN ketua_tim_assignments.created_by IS 'User yang membuat assignment ini (ADMIN)';

-- Create indexes for query optimization
CREATE INDEX IF NOT EXISTS idx_ketua_tim_user_id ON ketua_tim_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_ketua_tim_kegiatan_id ON ketua_tim_assignments(kegiatan_id);

-- Enable RLS
ALTER TABLE ketua_tim_assignments ENABLE ROW LEVEL SECURITY;

-- RLS policies following Pattern D (inline subquery)
-- Everyone can SELECT (needed for badge check and menu visibility)
CREATE POLICY "ketua_tim_select_all" ON ketua_tim_assignments
  FOR SELECT USING (true);

-- Only ADMIN can INSERT
CREATE POLICY "ketua_tim_insert_admin" ON ketua_tim_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = (SELECT auth.uid())
      AND r.nama = 'ADMIN'
    )
  );

-- Only ADMIN can UPDATE (for replacement scenarios)
CREATE POLICY "ketua_tim_update_admin" ON ketua_tim_assignments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = (SELECT auth.uid())
      AND r.nama = 'ADMIN'
    )
  );

-- Only ADMIN can DELETE
CREATE POLICY "ketua_tim_delete_admin" ON ketua_tim_assignments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = (SELECT auth.uid())
      AND r.nama = 'ADMIN'
    )
  );

-- Helper function: Check if user is chairman for a kegiatan
CREATE OR REPLACE FUNCTION is_user_chairman(
  p_user_id uuid,
  p_kegiatan_id uuid
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM ketua_tim_assignments
    WHERE user_id = p_user_id AND kegiatan_id = p_kegiatan_id
  );
END;
$$;

COMMENT ON FUNCTION is_user_chairman(uuid, uuid) IS 'Cek apakah user adalah chairman di kegiatan tertentu. Returns true/false.';

-- Helper function: Get all kegiatan where user is chairman
CREATE OR REPLACE FUNCTION get_user_chairman_kegiatan(
  p_user_id uuid
) RETURNS TABLE(kegiatan_id uuid, kegiatan_nama text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT kta.kegiatan_id, mk.nama as kegiatan_nama
  FROM ketua_tim_assignments kta
  JOIN master_kegiatan mk ON kta.kegiatan_id = mk.id
  WHERE kta.user_id = p_user_id
  ORDER BY mk.nama;
END;
$$;

COMMENT ON FUNCTION get_user_chairman_kegiatan(uuid) IS 'Get semua kegiatan dimana user adalah chairman. Returns table of kegiatan_id and kegiatan_nama.';