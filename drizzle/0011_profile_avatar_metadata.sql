ALTER TABLE auth.users
  ADD COLUMN avatar_storage_key text,
  ADD COLUMN avatar_mime_type text,
  ADD COLUMN avatar_size_bytes integer,
  ADD COLUMN avatar_updated_at timestamp with time zone;

ALTER TABLE auth.users
  ADD CONSTRAINT auth_users_avatar_mime_type_check
  CHECK (
    avatar_mime_type IS NULL
    OR avatar_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
  );

ALTER TABLE auth.users
  ADD CONSTRAINT auth_users_avatar_size_bytes_check
  CHECK (
    avatar_size_bytes IS NULL
    OR (avatar_size_bytes > 0 AND avatar_size_bytes <= 2097152)
  );
