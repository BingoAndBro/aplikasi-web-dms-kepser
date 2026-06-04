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

  it('uses document-aware preview and download routes for every apiType branch', () => {
    const source = readFileSync('src/components/dokumen/AttachmentViewer.tsx', 'utf8')

    expect(source).toContain('return `/api/dokumen/${dokumen.id}/preview/${idx}`')
    expect(source).toContain('return `/api/dokumen/${dokumen.id}/download/${idx}`')
    expect(source).toContain('return `/api/ppk/dokumen/${dokumen.id}/preview/${idx}`')
    expect(source).toContain('return `/api/ppk/dokumen/${dokumen.id}/download/${idx}`')
    expect(source).toContain('return `/api/bendahara/dokumen/${dokumen.id}/preview/${idx}`')
    expect(source).toContain('return `/api/bendahara/dokumen/${dokumen.id}/download/${idx}`')
    expect(source).toContain('const apiPath = getPreviewApiPath(idx)')
    expect(source).toContain('const signedUrlResult = await getSignedUrlFromApi(apiPath)')
    expect(source).toContain('const apiPath = getDownloadApiPath(idx)')
    expect(source).toContain('const result = await downloadFromApi(apiPath, filename)')
    expect(source).not.toContain('getSignedUrlDirectResult')
    expect(source).not.toContain('apiType === \'default\'')
    expect(source).not.toContain('/api/dokumen/preview-url?url=')
    expect(source).not.toContain('/api/dokumen/download-url?url=')
  })
})
