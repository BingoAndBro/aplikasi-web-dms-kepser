-- Add explicit FK constraint to enable PostgREST joins
-- This allows implicit joins like `user:auth_users!user_id(id, email)`

-- Drop existing FK constraints if they exist (will error if not exists, that's ok)
DO $$
BEGIN
  ALTER TABLE ketua_tim_assignments DROP CONSTRAINT IF EXISTS ketua_tim_assignments_user_id_fkey;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Constraint did not exist, skipping';
END $$;

DO $$
BEGIN
  ALTER TABLE ketua_tim_assignments DROP CONSTRAINT IF EXISTS ketua_tim_assignments_created_by_fkey;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Constraint did not exist, skipping';
END $$;

-- Add FK constraint to auth.users
ALTER TABLE ketua_tim_assignments
ADD CONSTRAINT ketua_tim_assignments_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add FK constraint for created_by
ALTER TABLE ketua_tim_assignments
ADD CONSTRAINT ketua_tim_assignments_created_by_fkey
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;