-- Migration: 004_storage_rls_cleanup
-- Created by: Deep Implement (SPEC 03)
-- Description: Supabase Storage RLS policies for dokumen-lampiran bucket + orphan cleanup trigger

-- ============================================================
-- NOTE: Run this AFTER creating Storage bucket "dokumen-lampiran"
-- in Supabase Dashboard → Storage → New Bucket
-- Bucket settings: Name=dokumen-lampiran, Public=OFF, File size limit=10MB
-- ============================================================

-- ============================================================
-- Storage RLS
-- ============================================================
ALTER TABLE "storage"."objects" ENABLE ROW LEVEL SECURITY;

-- Users can upload to their own folder [user_id]/
CREATE POLICY "storage_insert_own" ON "storage"."objects"
  FOR INSERT WITH CHECK (
    bucket_id = 'dokumen-lampiran'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read files in their own folder OR owned documents folder
CREATE POLICY "storage_select_own" ON "storage"."objects"
  FOR SELECT USING (
    bucket_id = 'dokumen-lampiran'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM "public"."dokumen_transaksi" dt
        WHERE dt.id::text = (storage.foldername(name))[2]
        AND dt.created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM "public"."user_roles" ur
        JOIN "public"."roles" r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid() AND r.nama IN ('PPK', 'BENDAHARA', 'ARSIPARIS', 'ADMIN')
      )
    )
  );

-- Users can delete own files only
CREATE POLICY "storage_delete_own" ON "storage"."objects"
  FOR DELETE USING (
    bucket_id = 'dokumen-lampiran'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- Orphan file cleanup trigger
-- When dokumen_transaksi is deleted, auto-delete all storage files
-- Storage path format: [user_id]/[dokumen_id]/[filename]
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_dokumen_files()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  doc_id_text TEXT;
  user_path TEXT;
BEGIN
  doc_id_text := OLD.id::text;
  user_path := OLD.created_by::text || '/' || doc_id_text || '/';

  -- Delete all files in the dokumen's folder
  DELETE FROM "storage"."objects"
  WHERE bucket_id = 'dokumen-lampiran'
  AND name LIKE user_path || '%';

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_dokumen_delete_cleanup ON "public"."dokumen_transaksi";
CREATE TRIGGER on_dokumen_delete_cleanup
  AFTER DELETE ON "public"."dokumen_transaksi"
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_dokumen_files();
