-- Create user_status table to track user active/inactive state
-- This is more reliable than Supabase Auth's disabled attribute

CREATE TABLE IF NOT EXISTS user_status (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS policies for user_status
ALTER TABLE user_status ENABLE ROW LEVEL SECURITY;

-- Everyone can read user_status (for checking own account status)
-- This is needed for login validation
CREATE POLICY "Anyone can read user_status" ON user_status
  FOR SELECT USING (true);

-- Only admin can insert/update/delete user_status
CREATE POLICY "Admin can manage user_status" ON user_status
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND r.nama = 'ADMIN'
    )
  );

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_status_is_active ON user_status(is_active);
CREATE INDEX IF NOT EXISTS idx_user_status_user_id ON user_status(user_id);