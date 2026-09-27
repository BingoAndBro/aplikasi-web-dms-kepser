import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Source guard: every form with an upload field that writes to the pending area
// must delete the pending uploads the user discards — replace/remove, leaving
// the page (menu, Kembalikan) and closing the tab.
function read(path: string) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}

const aju = read('src/routes/pegawai/dokumen/aju.tsx')
const attachmentEditor = read('src/components/dokumen/AttachmentEditor.tsx')
const penambahanArsip = read('src/routes/kasubag/penambahan-arsip.tsx')

describe('Ajukan Dokumen pending upload cleanup', () => {
  it('uses the shared cleanup client, session helper and leave hook', () => {
    expect(aju).toContain("import { requestPendingUploadCleanup } from '#/lib/storage/pending-upload-cleanup-client'")
    expect(aju).toContain("import { collectUnreferencedPendingUploadUrls } from '#/lib/storage/pending-upload-session'")
    expect(aju).toContain("useDiscardPendingUploadsOnLeave(sessionPendingUrlsRef, 'ajukan')")
    expect(aju).not.toContain("'/api/upload?cleanup=pending'")
  })

  it('cleans replaced or removed lampiran as soon as the checklist drops them', () => {
    const handler = aju.slice(aju.indexOf('const handleKelengkapanComplete'))
    expect(handler).toContain('collectUnreferencedPendingUploadUrls(sessionPendingUrlsRef.current, lampirans)')
    expect(handler).toContain("requestPendingUploadCleanup(discardedUrls, { context: 'ajukan-replaced-or-removed' })")
  })

  it('stops tracking once the files were formalized by a successful submit', () => {
    expect(aju).toContain('sessionPendingUrlsRef.current = new Set()\n      setSubmittedDocument')
  })
})

describe('AttachmentEditor pending upload cleanup (Edit Non-Material, Revisi Pegawai, Revisi PPK)', () => {
  it('discards this session\'s pending uploads when the page is left without saving', () => {
    expect(attachmentEditor).toContain("useDiscardPendingUploadsOnLeave(sessionPendingUrlsRef, 'AttachmentEditor')")
  })

  it('goes through the shared cleanup client instead of its own fetch', () => {
    expect(attachmentEditor).toContain("import { requestPendingUploadCleanup } from '#/lib/storage/pending-upload-cleanup-client'")
    expect(attachmentEditor).not.toContain("'/api/upload?cleanup=pending'")
  })

  it('still clears tracking after save and cancel so persisted files are never discarded', () => {
    const submit = attachmentEditor.slice(attachmentEditor.indexOf('async function handleSubmit()'))
    expect(submit).toContain('clearSessionPendingTracking()')
    const cancel = attachmentEditor.slice(attachmentEditor.indexOf('async function handleCancel()'), attachmentEditor.indexOf('async function handleSubmit()'))
    expect(cancel).toContain('clearSessionPendingTracking()')
  })
})

describe('Penambahan Arsip (KSBU) uses the same pending pattern', () => {
  it('uploads each lampiran to the pending area as soon as it is picked', () => {
    expect(penambahanArsip).toContain("import { uploadPendingFile } from '#/lib/storage/pending-upload-client'")
    expect(penambahanArsip).toContain('kelengkapanId: row.uploadId')
  })

  it('sends the pending paths with the create request instead of a second upload request', () => {
    const submit = penambahanArsip.slice(penambahanArsip.indexOf('async function handleFinalSubmit()'))
    expect(submit).toContain('attachments: attachmentValidation.rows.map((row) => ({')
    expect(penambahanArsip).not.toContain('/attachments`,')
    expect(penambahanArsip).not.toContain('new FormData()')
  })

  it('discards abandoned pending uploads: replaced/removed rows and leaving the form', () => {
    expect(penambahanArsip).toContain("useDiscardPendingUploadsOnLeave(sessionPendingUrlsRef, 'penambahan-arsip')")
    expect(penambahanArsip).toContain("requestPendingUploadCleanup([url], { context: 'penambahan-arsip-replaced-or-removed' })")
    expect(penambahanArsip).toContain('discardPendingUpload(row.pendingUrl)')
  })

  it('stops tracking once the create request succeeded', () => {
    const submit = penambahanArsip.slice(penambahanArsip.indexOf('async function handleFinalSubmit()'))
    expect(submit.indexOf('sessionPendingUrlsRef.current = new Set()')).toBeLessThan(submit.indexOf('await onSuccess('))
  })
})
