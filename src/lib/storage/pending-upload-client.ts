// Client-side upload of one file to the caller's pending area (POST /api/upload).
// The file is only moved to its final location when the form is submitted.
import { DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE } from '#/lib/upload/document-upload-policy'

export type PendingUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

export async function uploadPendingFile({
  file,
  kelengkapanId,
  namaDokumen,
}: {
  file: File
  /** UUID (or `user-custom-<uuid>`) that groups the upload; part of the pending path. */
  kelengkapanId: string
  namaDokumen: string
}): Promise<PendingUploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('kelengkapan_id', kelengkapanId)
  formData.append('nama_dokumen', namaDokumen)

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    })
    const json = await response.json().catch(() => null) as { url?: unknown; error?: unknown } | null

    if (!response.ok || typeof json?.url !== 'string') {
      return {
        ok: false,
        error: typeof json?.error === 'string' ? json.error : DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE,
      }
    }

    return { ok: true, url: json.url }
  } catch {
    return { ok: false, error: DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE }
  }
}
