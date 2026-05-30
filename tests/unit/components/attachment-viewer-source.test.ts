import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('AttachmentViewer destroyed-file UX wiring', () => {
  it('routes preview and download failures through safe storage-client messages', () => {
    const source = readFileSync('src/components/dokumen/AttachmentViewer.tsx', 'utf8')

    expect(source).toContain('fetchFileBlobWithSignedUrl')
    expect(source).toContain('setPreviewError(previewFile.error ??')
    expect(source).toContain('alert(result.error)')
    expect(source).toContain('Gagal memuat pratinjau')
    expect(source).toContain('Gagal mengunduh file')
    expect(source).not.toContain('alert(signedUrl)')
    expect(source).not.toContain('setPreviewError(signedUrl)')
    expect(source).not.toContain('token=')
    expect(source).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  })
})
