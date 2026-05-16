import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildSubmitMovePlan,
  type SubmitMovePlanAttachment,
} from '#/lib/storage/submit-move-plan'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_OWNER_ID = '99999999-9999-4999-8999-999999999999'
const DOKUMEN_ID = '22222222-2222-4222-8222-222222222222'
const FIRST_TARGET_UUID = '33333333-3333-4333-8333-333333333333'
const SECOND_TARGET_UUID = '44444444-4444-4444-8444-444444444444'
const KELENGKAPAN_ID = '55555555-5555-4555-8555-555555555555'
const TIMESTAMP = 1778064971564
const UPLOAD_PENDING_PATH = `${OWNER_ID}/${KELENGKAPAN_ID}_${TIMESTAMP}_Daftar_Absensi.PDF`
const DASH_PENDING_PATH = `${OWNER_ID}/${TIMESTAMP}-abc123xyz-Daftar_Absensi.pdf`
const FORMAL_PATH = `${OWNER_ID}/${DOKUMEN_ID}/${FIRST_TARGET_UUID}.pdf`
const TEST_ROOT_FRAGMENT = `${path.sep}.tmp${path.sep}submit-move-plan-root`

describe('submit move plan builder helper foundation', () => {
  it('plans underscore and dash pending attachments without touching route/runtime behavior', () => {
    const plan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      dokumenId: 'temp-id',
      attachments: [
        attachment({ url: UPLOAD_PENDING_PATH, nama: 'Daftar Absensi' }),
        attachment({ url: DASH_PENDING_PATH, nama: 'SPJ' }),
      ],
      targetUuidFactory: createUuidFactory(FIRST_TARGET_UUID, SECOND_TARGET_UUID),
    })

    expect(plan.hasBlockingIssues).toBe(false)
    expect(plan.moves).toEqual([
      {
        index: 0,
        oldPath: UPLOAD_PENDING_PATH,
        newPath: `${OWNER_ID}/temp-id/${FIRST_TARGET_UUID}.pdf`,
      },
      {
        index: 1,
        oldPath: DASH_PENDING_PATH,
        newPath: `${OWNER_ID}/temp-id/${SECOND_TARGET_UUID}.pdf`,
      },
    ])
    expect(plan.plannedAttachments).toEqual([
      attachment({
        url: `${OWNER_ID}/temp-id/${FIRST_TARGET_UUID}.pdf`,
        nama: 'Daftar Absensi',
      }),
      attachment({
        url: `${OWNER_ID}/temp-id/${SECOND_TARGET_UUID}.pdf`,
        nama: 'SPJ',
      }),
    ])
    expect(plan.entries.map(entry => entry.sourceClassification)).toEqual([
      'pending-upload-api',
      'pending-dash',
    ])
    expectNoPhysicalPathExposure(plan)
  })

  it('can plan real document-id targets when a later route proves that ordering safe', () => {
    const plan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      dokumenId: DOKUMEN_ID,
      attachments: [attachment({ url: DASH_PENDING_PATH })],
      targetUuidFactory: createUuidFactory(FIRST_TARGET_UUID),
    })

    expect(plan.moves).toEqual([
      {
        index: 0,
        oldPath: DASH_PENDING_PATH,
        newPath: FORMAL_PATH,
      },
    ])
    expect(plan.plannedAttachments[0].url).toBe(FORMAL_PATH)
    expectNoPhysicalPathExposure(plan)
  })

  it('leaves already formal attachments unchanged and preserves metadata', () => {
    const formalAttachment = attachment({
      url: FORMAL_PATH,
      nama: 'Sudah Formal',
      uploaded_at: new Date(TIMESTAMP).toISOString(),
    })

    const plan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      dokumenId: 'temp-id',
      attachments: [formalAttachment],
      targetUuidFactory: createUuidFactory(SECOND_TARGET_UUID),
    })

    expect(plan.hasBlockingIssues).toBe(false)
    expect(plan.moves).toEqual([])
    expect(plan.entries[0]).toMatchObject({
      action: 'unchanged',
      sourceLogicalPath: FORMAL_PATH,
      targetLogicalPath: FORMAL_PATH,
      sourceClassification: 'formal',
      issue: null,
    })
    expect(plan.plannedAttachments).toEqual([formalAttachment])
  })

  it('classifies safe but unclear paths as unsupported blocking outcomes', () => {
    const unsupportedPath = `${OWNER_ID}/notes/readme.txt`
    const plan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      attachments: [attachment({ url: unsupportedPath })],
      targetUuidFactory: createUuidFactory(FIRST_TARGET_UUID),
    })

    expect(plan.hasBlockingIssues).toBe(true)
    expect(plan.moves).toEqual([])
    expect(plan.entries[0]).toMatchObject({
      action: 'unsupported',
      sourceLogicalPath: unsupportedPath,
      targetLogicalPath: null,
      sourceClassification: 'unsupported',
      issue: {
        code: 'unsupported-source-path',
      },
    })
    expect(plan.issues).toEqual([
      {
        index: 0,
        code: 'unsupported-source-path',
        message: 'Attachment path is safe but not a supported submit move source.',
      },
    ])
  })

  it('reports unsafe paths, owner mismatch, missing URLs, and invalid source extensions without throwing', () => {
    const plan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      attachments: [
        attachment({ url: `${OWNER_ID}/../report.pdf` }),
        attachment({ url: `${OTHER_OWNER_ID}/${KELENGKAPAN_ID}_${TIMESTAMP}_report.pdf` }),
        attachment({ url: '' }),
        attachment({ url: `${OWNER_ID}/${TIMESTAMP}-abc123xyz-report` }),
      ],
      targetUuidFactory: createUuidFactory(FIRST_TARGET_UUID),
    })

    expect(plan.hasBlockingIssues).toBe(true)
    expect(plan.moves).toEqual([])
    expect(plan.issues.map(issue => issue.code)).toEqual([
      'invalid-source-path',
      'owner-mismatch',
      'missing-url',
      'invalid-source-extension',
    ])
    expect(plan.entries.every(entry => entry.action === 'invalid' || entry.action === 'unsupported'))
      .toBe(true)
    expectNoPhysicalPathExposure(plan)
  })

  it('reports invalid owner, document, and target UUID inputs as logical planning issues', () => {
    const invalidOwnerPlan = buildSubmitMovePlan({
      ownerUserId: 'owner/../other',
      attachments: [attachment({ url: UPLOAD_PENDING_PATH })],
    })

    expect(invalidOwnerPlan.issues).toEqual([
      {
        index: 0,
        code: 'invalid-owner-id',
        message: 'Submit move path segment is not safe.',
      },
    ])

    const invalidDocumentPlan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      dokumenId: 'dokumen/../other',
      attachments: [attachment({ url: UPLOAD_PENDING_PATH })],
    })

    expect(invalidDocumentPlan.issues).toEqual([
      {
        index: 0,
        code: 'invalid-document-id',
        message: 'Submit move path segment is not safe.',
      },
    ])

    const invalidUuidPlan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      attachments: [attachment({ url: UPLOAD_PENDING_PATH })],
      targetUuidFactory: createUuidFactory('not-a-uuid'),
    })

    expect(invalidUuidPlan.issues).toEqual([
      {
        index: 0,
        code: 'invalid-target-uuid',
        message: 'Submit move target UUID is not valid.',
      },
    ])
    expectNoPhysicalPathExposure(invalidUuidPlan)
  })
})

function attachment(overrides: Partial<SubmitMovePlanAttachment>): SubmitMovePlanAttachment {
  return {
    kelengkapan_id: KELENGKAPAN_ID,
    nama: 'Lampiran',
    url: UPLOAD_PENDING_PATH,
    uploaded_at: new Date(TIMESTAMP).toISOString(),
    ...overrides,
  }
}

function createUuidFactory(...uuids: string[]): () => string {
  let index = 0

  return () => uuids[index++] ?? uuids[uuids.length - 1] ?? FIRST_TARGET_UUID
}

function expectNoPhysicalPathExposure(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain(TEST_ROOT_FRAGMENT)
  expect(serialized).not.toContain('D:\\')
  expect(serialized).not.toContain('/storage/')
}
