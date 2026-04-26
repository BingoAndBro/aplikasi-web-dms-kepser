-- =====================================================
-- 008_seed_arsiparis.sql
-- Assign ARSIPARIS role ke user existing multi@testbps.local
-- + opsional: buat user arsiparis@testbps.local jika belum ada
-- Idempotent — aman dijalankan lebih dari sekali
-- =====================================================

DO $$
DECLARE
  arsiparis_role_id uuid;
  pegawai_role_id uuid;
  arsiparis_user_id uuid;
  multi_user_id uuid;
BEGIN
  -- Get role IDs
  SELECT id INTO arsiparis_role_id FROM roles WHERE nama = 'ARSIPARIS';
  SELECT id INTO pegawai_role_id FROM roles WHERE nama = 'PEGAWAI';

  IF arsiparis_role_id IS NULL THEN
    RAISE NOTICE 'Role ARSIPARIS tidak ditemukan. Pastikan 001_auth_rbac.sql sudah dijalankan.';
    RETURN;
  END IF;

  -- =====================================================
  -- PART 1: Assign ARSIPARIS role ke user existing multi@testbps.local
  -- =====================================================
  SELECT id INTO multi_user_id FROM auth.users WHERE email = 'multi@testbps.local';

  IF multi_user_id IS NOT NULL THEN
    -- Assign ARSIPARIS role
    INSERT INTO user_roles (user_id, role_id)
    VALUES (multi_user_id, arsiparis_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;

    -- Assign PEGAWAI role (jika belum ada)
    INSERT INTO user_roles (user_id, role_id)
    VALUES (multi_user_id, pegawai_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;

    RAISE NOTICE 'ARSIPARIS role berhasil diassign ke multi@testbps.local (ID: %).', multi_user_id;
  ELSE
    RAISE NOTICE 'User multi@testbps.local belum ada di database auth.users.';
    RAISE NOTICE 'Silakan buat user terlebih dahulu di Supabase Dashboard > Authentication > Users > Invite User';
  END IF;

  -- =====================================================
  -- PART 2: Buat user ARSIPARIS dedicated (arsiparis@testbps.local)
  -- Menggunakan Supabase Admin API (bukan SQL langsung ke auth.users)
  -- =====================================================
  -- NOTE: Pembuatan user sebaiknya dilakukan via Supabase Admin API
  -- atau Dashboard > Authentication > Users > Invite User
  --
  -- Untuk seed via SQL, Anda perlu enable "Enable Sign Up" dan
  -- menggunakan hook / trigger. Cara termudah:
  --   1. Buka Supabase Dashboard
  --   2. Authentication > Users > Add User
  --   3. Email: arsiparis@testbps.local
  --   4. Password: Arsip BPS123
  --   5. Setelah dibuat, jalankan ulang migration ini
  --
  -- Setelah user dibuat, migration ini akan otomatis assign role.

  -- Cek apakah arsiparis@testbps.local sudah ada
  SELECT id INTO arsiparis_user_id FROM auth.users WHERE email = 'arsiparis@testbps.local';

  IF arsiparis_user_id IS NOT NULL THEN
    -- Assign ARSIPARIS role
    INSERT INTO user_roles (user_id, role_id)
    VALUES (arsiparis_user_id, arsiparis_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;

    -- Assign PEGAWAI role
    INSERT INTO user_roles (user_id, role_id)
    VALUES (arsiparis_user_id, pegawai_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;

    RAISE NOTICE 'Role berhasil diassign ke arsiparis@testbps.local (ID: %).', arsiparis_user_id;
  ELSE
    RAISE NOTICE 'User arsiparis@testbps.local belum ada — dibuat manual di Supabase Dashboard.';
  END IF;

END $$;

-- =====================================================
-- VERIFIKASI: Jalankan query ini setelah migration selesai
-- =====================================================
-- SELECT
--   u.email,
--   u.raw_user_meta_data->>'user_name' as nama,
--   array_agg(r.nama) as roles
-- FROM auth.users u
-- JOIN user_roles ur ON ur.user_id = u.id
-- JOIN roles r ON r.id = ur.role_id
-- WHERE u.email IN ('multi@testbps.local', 'arsiparis@testbps.local')
-- GROUP BY u.id, u.email, u.raw_user_meta_data;
