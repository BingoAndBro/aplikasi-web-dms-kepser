-- supabase/migrations/007_cron_arsip.sql
-- pg_cron schedule untuk auto-transition arsip berdasarkan masa retensi
-- Dijalankan setiap hari jam 02:00

-- Enable pg_cron extension (jika belum enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Hapus schedule lama jika ada (untuk idempotent setup)
SELECT cron.unschedule('check-arsip-retensi');

-- Schedule Edge Function via pg_cron
-- Ganti YOUR_SUPABASE_PROJECT_URL dengan nilai sebenarnya
-- atau gunakan environment variable jika didukung
SELECT cron.schedule(
  'check-arsip-retensi',
  '0 2 * * *', -- cron expression: setiap hari jam 02:00
  $$
  SELECT net.http_post(
    url := (SELECT current_setting('app.settings.SUPABASE_URL', true)) || '/functions/v1/arsip-retensi',
    headers := '{"Authorization": "Bearer ' || (SELECT current_setting('app.settings.SERVICE_ROLE_KEY', true)) || '", "Content-Type": "application/json"}',
    body := '{"source": "pg_cron"}'
  );
  $$
);

-- Verifikasi schedule dibuat
-- SELECT cron.jobid, cron.jobname, cron.schedule FROM cron.job WHERE cron.jobname = 'check-arsip-retensi';

-- Catatan:
-- - Pastikan pg_cron enabled di Supabase: Database > Extensions > pg_cron
-- - Pastikan Edge Function "arsip-retensi" sudah di-deploy di Supabase
-- - Service role key digunakan karena cron job berjalan sebagai superuser
-- - UNIQUE constraint di arsip_verifikasi_penyusutan dan arsip_usul_musnah
--   mencegah duplicate transition jika function overlap
