INSERT INTO auth.roles (id, nama, description, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666666',
  'PENANGGUNG_JAWAB_KINERJA',
  'Penanggung Jawab Kinerja pembaca laporan kinerja final',
  now(),
  now()
)
ON CONFLICT (nama) DO UPDATE
SET
  description = EXCLUDED.description,
  updated_at = now();
