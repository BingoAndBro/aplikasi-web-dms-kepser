// Server-only module. Do not import from client components.
// Status transitions update with `WHERE id = ? AND status = <expected>`; zero
// affected rows means a concurrent request already moved the document, so the
// transaction is aborted (no log row is written) and the caller answers 409.

export const DOKUMEN_TRANSITION_CONFLICT_MESSAGE =
  'Dokumen sudah diproses oleh pengguna lain. Muat ulang halaman untuk melihat status terbaru.'

export class DokumenTransitionConflictError extends Error {
  constructor() {
    super('DOKUMEN_TRANSITION_CONFLICT')
    this.name = 'DokumenTransitionConflictError'
  }
}

export function dokumenTransitionConflictResponse(): Response {
  return Response.json({ error: DOKUMEN_TRANSITION_CONFLICT_MESSAGE }, { status: 409 })
}
