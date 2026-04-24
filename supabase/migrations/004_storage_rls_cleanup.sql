-- Migration: 004_storage_rls_cleanup
-- Created by: Deep Implement (SPEC 03)
-- Description: Supabase Storage RLS policies for dokumen-lampiran bucket + orphan cleanup trigger

-- ============================================================
-- NOTE: Run this AFTER creating Storage bucket "dokumen-lampiran"
-- in Supabase Dashboard → Storage → New Bucket
-- Bucket settings: Name=dokumen-lampiran, Public=OFF, File size limit=2MB
--
-- The bucket's Public=OFF setting provides the RLS protection for storage files.
-- We only create bucket-level policies here. DO NOT ALTER TABLE storage.objects
-- directly — it is managed by Supabase and requires elevated privileges.
-- ============================================================

-- ============================================================
-- Bucket Policies
-- These policies work alongside the bucket's public/private setting.
-- When Public=OFF, files are only accessible via signed URLs or authenticated access.
-- ============================================================

-- Allow authenticated users to upload to their own folder
CREATE POLICY "storage_insert_own" ON "storage"."objects"
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dokumen-lampiran'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to read files in their own folder or owned documents
CREATE POLICY "storage_select_own" ON "storage"."objects"
  FOR SELECT TO authenticated
  USING (
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

-- Allow users to delete their own files only
CREATE POLICY "storage_delete_own" ON "storage"."objects"
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dokumen-lampiran'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- Orphan file cleanup trigger — COMMENTED OUT
-- Reason: Supabase hosted blocks direct DELETE on storage.objects table.
-- Storage cleanup is handled by the application layer (dokumen.$id.ts PATCH handler)
-- using supabase.storage.from().remove(), which is the correct approach.
-- Keeping the function definition commented for reference only.
-- ============================================================

-- CREATE OR REPLACE FUNCTION cleanup_dokumen_files()
-- RETURNS TRIGGER
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--   doc_id_text TEXT;
--   user_path TEXT;
-- BEGIN
--   doc_id_text := OLD.id::text;
--   user_path := OLD.created_by::text || '/' || doc_id_text || '/';
--
--   -- Delete all files in the dokumen's folder
--   DELETE FROM "storage"."objects"
--   WHERE bucket_id = 'dokumen-lampiran'
--   AND name LIKE user_path || '%';
--
--   RETURN OLD;
-- END;
-- $$;
--
-- DROP TRIGGER IF EXISTS on_dokumen_delete_cleanup ON "public"."dokumen_transaksi";
-- CREATE TRIGGER on_dokumen_delete_cleanup
--   AFTER DELETE ON "public"."dokumen_transaksi"
--   FOR EACH ROW
--   EXECUTE FUNCTION cleanup_dokumen_files();
