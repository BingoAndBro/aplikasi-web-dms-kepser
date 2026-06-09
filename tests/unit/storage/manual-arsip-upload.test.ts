import { describe, expect, it } from 'vitest'

import {
  MANUAL_ARSIP_ATTACHMENT_MAX_BYTES,
  ManualArsipUploadError,
  createManualArsipAttachmentStorageDescriptors,
  isAllowedManualArsipAttachmentContentType,
  writeManualArsipAttachmentContent,
} from '#/lib/storage/manual-arsip-upload'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const MANUAL_ARSIP_ID = '22222222-2222-4222-8222-222222222222'

describe('manual arsip upload policy alignment', () => {
  it('uses the central document/lampiran 5 MB policy', () => {
    expect(MANUAL_ARSIP_ATTACHMENT_MAX_BYTES).toBe(5 * 1024 * 1024)
    expect(isAllowedManualArsipAttachmentContentType('application/pdf')).toBe(true)
    expect(isAllowedManualArsipAttachmentContentType('application/msword')).toBe(true)
    expect(isAllowedManualArsipAttachmentContentType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true)
    expect(isAllowedManualArsipAttachmentContentType('application/vnd.ms-excel')).toBe(true)
    expect(isAllowedManualArsipAttachmentContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true)
    expect(isAllowedManualArsipAttachmentContentType('image/jpeg')).toBe(true)
    expect(isAllowedManualArsipAttachmentContentType('image/png')).toBe(true)
  })

  it('rejects webp, svg, archives, and extension/MIME mismatches', () => {
    for (const file of [
      { name: 'avatar.webp', type: 'image/webp', size: 10 },
      { name: 'vector.svg', type: 'image/svg+xml', size: 10 },
      { name: 'bundle.zip', type: 'application/zip', size: 10 },
      { name: 'report.pdf', type: 'image/png', size: 10 },
    ]) {
      expect(() => createManualArsipAttachmentStorageDescriptors({
        files: [file],
        manualArsipId: MANUAL_ARSIP_ID,
        ownerUserId: OWNER_ID,
      })).toThrow(ManualArsipUploadError)
    }
  })

  it('creates descriptors for allowed office and image attachments without exposing physical paths', () => {
    const descriptors = createManualArsipAttachmentStorageDescriptors({
      files: [
        { name: 'surat.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 10 },
        { name: 'bukti.jpeg', type: 'image/jpeg', size: 10 },
      ],
      manualArsipId: MANUAL_ARSIP_ID,
      ownerUserId: OWNER_ID,
      uuidFactory: () => '33333333-3333-4333-8333-333333333333',
    })

    expect(descriptors).toEqual([
      expect.objectContaining({
        originalFilename: 'surat.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: 'docx',
        sizeBytes: 10,
      }),
      expect.objectContaining({
        originalFilename: 'bukti.jpeg',
        contentType: 'image/jpeg',
        extension: 'jpeg',
        sizeBytes: 10,
      }),
    ])
    expect(JSON.stringify(descriptors)).not.toContain('D:\\')
    expect(JSON.stringify(descriptors)).not.toContain('storage_root')
  })

  it('rejects invalid content signatures when declared content type is supplied', async () => {
    await expect(writeManualArsipAttachmentContent({
      logicalPath: `${OWNER_ID}/${MANUAL_ARSIP_ID}_spoofed.pdf`,
      content: Buffer.from('<script></script>'),
      expectedBytes: 17,
      expectedContentType: 'application/pdf',
      expectedExtension: 'pdf',
    })).rejects.toMatchObject({ code: 'invalid-file-signature' })
  })
})
