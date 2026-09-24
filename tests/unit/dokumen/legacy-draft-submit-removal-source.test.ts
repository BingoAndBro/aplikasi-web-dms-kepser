import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dokumenIndexRoute = readFileSync('src/routes/api/dokumen/index.ts', 'utf8')
const dokumenIdSubmitRoute = readFileSync('src/routes/api/dokumen.$id.submit.ts', 'utf8')

describe('legacy DRAFT create/submit path is removed', () => {
  it('keeps GET /api/dokumen but no longer exposes POST (create DRAFT)', () => {
    expect(dokumenIndexRoute).toContain('GET: async')
    expect(dokumenIndexRoute).not.toContain('POST: async')
    expect(dokumenIndexRoute).not.toContain('DOC_STATUS.DRAFT')
  })

  it('only accepts the Pegawai RESUBMIT path in POST /api/dokumen/$id/submit', () => {
    expect(dokumenIdSubmitRoute).not.toMatch(/status === 'DRAFT'/)
    expect(dokumenIdSubmitRoute).not.toContain("'SUBMIT'")
    expect(dokumenIdSubmitRoute).not.toContain("newStatus: 'COMPLETED'")
    expect(dokumenIdSubmitRoute).toContain("dok.status !== 'NEED_REVISION' || dok.revision_target !== 'USER'")
    expect(dokumenIdSubmitRoute).toContain("transition(dok.status as StatusDokumen, 'RESUBMIT', 'PEGAWAI', dok.revision_target)")
    expect(dokumenIdSubmitRoute).toContain("aksi: 'RESUBMIT'")
  })
})
