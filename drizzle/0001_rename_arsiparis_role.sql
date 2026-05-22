DO $$
DECLARE
  old_role_id uuid;
  new_role_id uuid;
BEGIN
  SELECT id INTO old_role_id
  FROM auth.roles
  WHERE nama = 'ARSIPARIS';

  SELECT id INTO new_role_id
  FROM auth.roles
  WHERE nama = 'KEPALA_SUB_BAGIAN_UMUM';

  IF old_role_id IS NOT NULL AND new_role_id IS NULL THEN
    UPDATE auth.roles
    SET
      nama = 'KEPALA_SUB_BAGIAN_UMUM',
      description = 'Kepala Sub Bagian Umum pengelola arsip dokumen',
      updated_at = now()
    WHERE id = old_role_id;
  ELSIF old_role_id IS NOT NULL AND new_role_id IS NOT NULL AND old_role_id <> new_role_id THEN
    INSERT INTO auth.user_roles (user_id, role_id, created_at)
    SELECT user_id, new_role_id, created_at
    FROM auth.user_roles
    WHERE role_id = old_role_id
    ON CONFLICT DO NOTHING;

    DELETE FROM auth.user_roles
    WHERE role_id = old_role_id;

    DELETE FROM auth.roles
    WHERE id = old_role_id;

    UPDATE auth.roles
    SET
      description = 'Kepala Sub Bagian Umum pengelola arsip dokumen',
      updated_at = now()
    WHERE id = new_role_id;
  END IF;
END $$;
