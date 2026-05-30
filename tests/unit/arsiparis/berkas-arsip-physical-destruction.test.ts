import path from 'node:path'
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import {
  BERKAS_PHYSICAL_DESTRUCTION_CONFIRMATION_PHRASE,
  analyzeBerkasPhysicalFileDestruction,
  createLocalBerkasPhysicalDestructionStorage,
  executeBerkasPhysicalFileDestruction,
  type BerkasPhysicalDestructionFolderRow,
  type BerkasPhysicalDestructionItemRow,
  type BerkasPhysicalDestructionManualAttachmentRow,
  type BerkasPhysicalDestructionRepository,
  type BerkasPhysicalDestructionWorkflowSourceRow,
} from '#/lib/archive/berkas-arsip-physical-destruction'

const BERKAS_ID = '11111111-1111-4111-8111-111111111111'
const DOKUMEN_ID = '22222222-2222-4222-8222-222222222222'
const MANUAL_ARSIP_ID = '33333333-3333-4333-8333-333333333333'
const WORKFLOW_LOGICAL_PATH = 'owner-user/workflow/bukti-pembayaran.pdf'
const WORKFLOW_SECOND_LOGICAL_PATH = 'owner-user/workflow/dokumen-pendukung.pdf'
const MANUAL_LOGICAL_PATH = 'manual-arsip/owner-user/manual/bukti-manual.pdf'
const DUPLICATE_LOGICAL_PATH = 'owner-user/workflow/duplicate.pdf'
const MISSING_LOGICAL_PATH = 'owner-user/workflow/missing.pdf'
const DIRECTORY_LOGICAL_PATH = 'owner-user/workflow/directory-candidate'
const SYMLINK_LOGICAL_PATH = 'owner-user/workflow/symlink-candidate.pdf'
const TEST_ROOT = path.resolve('.tmp', 'berkas-arsip-physical-destruction')

describe('folder-first berkas physical file destruction helper', () => {
  beforeEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  it('rejects missing berkas safely', async () => {
    const report = await analyzeBerkasPhysicalFileDestruction({
      berkasId: BERKAS_ID,
      repository: createRepository({ folder: null }),
      storage: createLocalBerkasPhysicalDestructionStorage(TEST_ROOT),
    })

    expect(report).toMatchObject({
      status: 'not_found',
      total_items: 0,
      physical_deletion_performed: false,
    })
    expectNoLeak(report)
  })

  it.each([
    ['OPEN/null', { status_berkas: 'OPEN', status_arsip: null }],
    ['CLOSED/null', { status_berkas: 'CLOSED', status_arsip: null }],
    ['CLOSED/AKTIF', { status_berkas: 'CLOSED', status_arsip: 'AKTIF' }],
    ['CLOSED/INAKTIF', { status_berkas: 'CLOSED', status_arsip: 'INAKTIF' }],
    ['CLOSED/USUL_MUSNAH', { status_berkas: 'CLOSED', status_arsip: 'USUL_MUSNAH' }],
  ] as const)('rejects %s without candidate collection', async (_label, folderStatus) => {
    const repository = createRepository({ folder: folderRow(folderStatus) })

    const report = await analyzeBerkasPhysicalFileDestruction({
      berkasId: BERKAS_ID,
      repository,
      storage: createLocalBerkasPhysicalDestructionStorage(TEST_ROOT),
    })

    expect(report).toMatchObject({
      status: 'not_destroyed',
      total_items: 0,
      errors: ['FOLDER_NOT_DIMUSNAHKAN'],
      physical_deletion_performed: false,
    })
    expect(repository.listBerkasItems).not.toHaveBeenCalled()
    expectNoLeak(report)
  })

  it('dry-runs CLOSED/DIMUSNAHKAN candidates and deletes nothing', async () => {
    await writeLogicalFile(WORKFLOW_LOGICAL_PATH, 'workflow')
    await writeLogicalFile(MANUAL_LOGICAL_PATH, 'manual')

    const report = await analyzeBerkasPhysicalFileDestruction({
      berkasId: BERKAS_ID,
      repository: createRepository(),
      storage: createLocalBerkasPhysicalDestructionStorage(TEST_ROOT),
    })

    expect(report).toMatchObject({
      status: 'dry_run',
      total_items: 2,
      workflow_attachment_candidates: 1,
      manual_attachment_candidates: 1,
      deleted_count: 0,
      already_missing_count: 0,
      physical_deletion_performed: false,
      errors: [],
    })
    await expect(readLogicalFile(WORKFLOW_LOGICAL_PATH)).resolves.toBe('workflow')
    await expect(readLogicalFile(MANUAL_LOGICAL_PATH)).resolves.toBe('manual')
    expectNoLeak(report)
  })

  it('rejects execution without exact confirmation and deletes nothing', async () => {
    await writeLogicalFile(WORKFLOW_LOGICAL_PATH, 'workflow')

    const report = await executeBerkasPhysicalFileDestruction({
      berkasId: BERKAS_ID,
      confirmation: 'MUSNAHKAN DATA FILE',
      repository: createRepository(),
      storage: createLocalBerkasPhysicalDestructionStorage(TEST_ROOT),
    })

    expect(report).toMatchObject({
      status: 'confirmation_required',
      deleted_count: 0,
      physical_deletion_performed: false,
      errors: ['CONFIRMATION_REQUIRED'],
    })
    await expect(readLogicalFile(WORKFLOW_LOGICAL_PATH)).resolves.toBe('workflow')
    expectNoLeak(report)
  })

  it('executes deletion only for safe workflow and manual folder-member files', async () => {
    await writeLogicalFile(WORKFLOW_LOGICAL_PATH, 'workflow')
    await writeLogicalFile(MANUAL_LOGICAL_PATH, 'manual')

    const repository = createRepository()
    const report = await executeBerkasPhysicalFileDestruction({
      berkasId: BERKAS_ID,
      confirmation: BERKAS_PHYSICAL_DESTRUCTION_CONFIRMATION_PHRASE,
      repository,
      storage: createLocalBerkasPhysicalDestructionStorage(TEST_ROOT),
    })

    expect(report).toMatchObject({
      status: 'completed',
      total_items: 2,
      workflow_attachment_candidates: 1,
      manual_attachment_candidates: 1,
      deleted_count: 2,
      already_missing_count: 0,
      failed_count: 0,
      physical_deletion_performed: true,
      errors: [],
    })
    await expect(readLogicalFile(WORKFLOW_LOGICAL_PATH)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readLogicalFile(MANUAL_LOGICAL_PATH)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(repository.mutationCalls).toBe(0)
    expectNoLeak(report)
  })

  it('deduplicates duplicate file candidates before deletion', async () => {
    await writeLogicalFile(DUPLICATE_LOGICAL_PATH, 'duplicate')

    const report = await executeBerkasPhysicalFileDestruction({
      berkasId: BERKAS_ID,
      confirmation: BERKAS_PHYSICAL_DESTRUCTION_CONFIRMATION_PHRASE,
      repository: createRepository({
        workflowSources: [{
          id: DOKUMEN_ID,
          lampiran_urls: [
            { nama: 'Duplicate 1', url: DUPLICATE_LOGICAL_PATH },
            { nama: 'Duplicate 2', url: DUPLICATE_LOGICAL_PATH },
          ],
        }],
        manualAttachments: [{
          manual_arsip_id: MANUAL_ARSIP_ID,
          logical_path: DUPLICATE_LOGICAL_PATH,
        }],
      }),
      storage: createLocalBerkasPhysicalDestructionStorage(TEST_ROOT),
    })

    expect(report).toMatchObject({
      status: 'completed',
      workflow_attachment_candidates: 2,
      manual_attachment_candidates: 1,
      deleted_count: 1,
      skipped_duplicate_count: 2,
      physical_deletion_performed: true,
      errors: ['DUPLICATE_FILE_CANDIDATE_SKIPPED'],
    })
    await expect(readLogicalFile(DUPLICATE_LOGICAL_PATH)).rejects.toMatchObject({ code: 'ENOENT' })
    expectNoLeak(report)
  })

  it('counts missing files as already missing without failing the operation', async () => {
    const report = await executeBerkasPhysicalFileDestruction({
      berkasId: BERKAS_ID,
      confirmation: BERKAS_PHYSICAL_DESTRUCTION_CONFIRMATION_PHRASE,
      repository: createRepository({
        workflowSources: [{
          id: DOKUMEN_ID,
          lampiran_urls: [{ nama: 'Missing', url: MISSING_LOGICAL_PATH }],
        }],
        manualAttachments: [],
      }),
      storage: createLocalBerkasPhysicalDestructionStorage(TEST_ROOT),
    })

    expect(report).toMatchObject({
      status: 'completed',
      deleted_count: 0,
      already_missing_count: 1,
      physical_deletion_performed: false,
      errors: ['PHYSICAL_FILE_ALREADY_MISSING'],
    })
    expectNoLeak(report)
  })

  it('skips unsafe logical paths without exposing them', async () => {
    const report = await executeBerkasPhysicalFileDestruction({
      berkasId: BERKAS_ID,
      confirmation: BERKAS_PHYSICAL_DESTRUCTION_CONFIRMATION_PHRASE,
      repository: createRepository({
        workflowSources: [{
          id: DOKUMEN_ID,
          lampiran_urls: [
            { nama: 'Traversal', url: '../secret.pdf' },
            { nama: 'Protocol', url: 'file://secret.pdf' },
          ],
        }],
        manualAttachments: [{
          manual_arsip_id: MANUAL_ARSIP_ID,
          logical_path: 'C:\\storage\\secret.pdf',
        }],
      }),
      storage: createLocalBerkasPhysicalDestructionStorage(TEST_ROOT),
    })

    expect(report).toMatchObject({
      status: 'partial',
      workflow_attachment_candidates: 2,
      manual_attachment_candidates: 1,
      skipped_unsafe_count: 3,
      deleted_count: 0,
      physical_deletion_performed: false,
      errors: ['UNSAFE_FILE_CANDIDATE_SKIPPED'],
    })
    expectNoLeak(report)
  })

  it('skips directories and symlink-like non-regular candidates safely', async () => {
    await mkdir(pathForLogicalPath(DIRECTORY_LOGICAL_PATH), { recursive: true })
    const symlinkCreated = await tryCreateSymlink(SYMLINK_LOGICAL_PATH, WORKFLOW_SECOND_LOGICAL_PATH)

    const workflowUrls = [
      { nama: 'Directory', url: DIRECTORY_LOGICAL_PATH },
      ...(symlinkCreated ? [{ nama: 'Symlink', url: SYMLINK_LOGICAL_PATH }] : []),
    ]

    const report = await executeBerkasPhysicalFileDestruction({
      berkasId: BERKAS_ID,
      confirmation: BERKAS_PHYSICAL_DESTRUCTION_CONFIRMATION_PHRASE,
      repository: createRepository({
        workflowSources: [{
          id: DOKUMEN_ID,
          lampiran_urls: workflowUrls,
        }],
        manualAttachments: [],
      }),
      storage: createLocalBerkasPhysicalDestructionStorage(TEST_ROOT),
    })

    expect(report.status).toBe('partial')
    expect(report.skipped_unsafe_count).toBe(workflowUrls.length)
    expect(report.deleted_count).toBe(0)
    expect(report.errors).toEqual(['UNSAFE_FILE_CANDIDATE_SKIPPED'])
    expectNoLeak(report)
  })

  it('returns safe partial failure categories when storage deletion fails', async () => {
    const storage = createLocalBerkasPhysicalDestructionStorage(TEST_ROOT)
    const failingStorage = {
      resolveCandidateKey: storage.resolveCandidateKey,
      deleteLogicalFile: vi.fn(async () => 'failed' as const),
    }

    const report = await executeBerkasPhysicalFileDestruction({
      berkasId: BERKAS_ID,
      confirmation: BERKAS_PHYSICAL_DESTRUCTION_CONFIRMATION_PHRASE,
      repository: createRepository(),
      storage: failingStorage,
    })

    expect(report).toMatchObject({
      status: 'failed',
      failed_count: 2,
      deleted_count: 0,
      physical_deletion_performed: false,
      errors: ['PHYSICAL_FILE_DELETE_FAILED'],
    })
    expectNoLeak(report)
  })

  it('is idempotent when executed a second time', async () => {
    await writeLogicalFile(WORKFLOW_LOGICAL_PATH, 'workflow')
    await writeLogicalFile(MANUAL_LOGICAL_PATH, 'manual')

    const input = {
      berkasId: BERKAS_ID,
      confirmation: BERKAS_PHYSICAL_DESTRUCTION_CONFIRMATION_PHRASE,
      repository: createRepository(),
      storage: createLocalBerkasPhysicalDestructionStorage(TEST_ROOT),
    }
    const first = await executeBerkasPhysicalFileDestruction(input)
    const second = await executeBerkasPhysicalFileDestruction(input)

    expect(first).toMatchObject({
      status: 'completed',
      deleted_count: 2,
      already_missing_count: 0,
    })
    expect(second).toMatchObject({
      status: 'completed',
      deleted_count: 0,
      already_missing_count: 2,
      physical_deletion_performed: false,
      errors: ['PHYSICAL_FILE_ALREADY_MISSING'],
    })
    expectNoLeak(first)
    expectNoLeak(second)
  })
})

type RepositoryOptions = {
  folder?: BerkasPhysicalDestructionFolderRow | null
  items?: BerkasPhysicalDestructionItemRow[]
  workflowSources?: BerkasPhysicalDestructionWorkflowSourceRow[]
  manualAttachments?: BerkasPhysicalDestructionManualAttachmentRow[]
}

type FakeRepository = BerkasPhysicalDestructionRepository & {
  listBerkasItems: ReturnType<typeof vi.fn>
  mutationCalls: number
}

function createRepository(options: RepositoryOptions = {}): FakeRepository {
  const repository = {
    mutationCalls: 0,
    getBerkasForPhysicalDestruction: vi.fn(async () => (
      options.folder === undefined
        ? folderRow({ status_berkas: 'CLOSED', status_arsip: 'DIMUSNAHKAN' })
        : options.folder
    )),
    listBerkasItems: vi.fn(async () => options.items ?? defaultItems()),
    listWorkflowAttachmentSources: vi.fn(async (dokumenIds: string[]) => (
      (options.workflowSources ?? defaultWorkflowSources())
        .filter((source) => dokumenIds.includes(source.id))
    )),
    listManualAttachmentSources: vi.fn(async (manualArsipIds: string[]) => (
      (options.manualAttachments ?? defaultManualAttachments())
        .filter((attachment) => manualArsipIds.includes(attachment.manual_arsip_id))
    )),
  }

  return repository
}

function folderRow(overrides: {
  status_berkas: string
  status_arsip: string | null
}): BerkasPhysicalDestructionFolderRow {
  return {
    id: BERKAS_ID,
    ...overrides,
  }
}

function defaultItems(): BerkasPhysicalDestructionItemRow[] {
  return [
    {
      id: 'item-workflow',
      berkas_id: BERKAS_ID,
      source_type: 'WORKFLOW',
      dokumen_id: DOKUMEN_ID,
      manual_arsip_id: null,
    },
    {
      id: 'item-manual',
      berkas_id: BERKAS_ID,
      source_type: 'MANUAL',
      dokumen_id: null,
      manual_arsip_id: MANUAL_ARSIP_ID,
    },
  ]
}

function defaultWorkflowSources(): BerkasPhysicalDestructionWorkflowSourceRow[] {
  return [{
    id: DOKUMEN_ID,
    lampiran_urls: [{
      nama: 'Bukti Pembayaran',
      url: WORKFLOW_LOGICAL_PATH,
    }],
  }]
}

function defaultManualAttachments(): BerkasPhysicalDestructionManualAttachmentRow[] {
  return [{
    manual_arsip_id: MANUAL_ARSIP_ID,
    logical_path: MANUAL_LOGICAL_PATH,
  }]
}

async function writeLogicalFile(logicalPath: string, content: string): Promise<void> {
  const targetPath = pathForLogicalPath(logicalPath)
  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, content)
}

async function readLogicalFile(logicalPath: string): Promise<string> {
  return readFile(pathForLogicalPath(logicalPath), 'utf8')
}

function pathForLogicalPath(logicalPath: string): string {
  return path.join(TEST_ROOT, ...logicalPath.split('/'))
}

async function tryCreateSymlink(
  logicalPath: string,
  targetLogicalPath: string,
): Promise<boolean> {
  try {
    await writeLogicalFile(targetLogicalPath, 'target')
    const linkPath = pathForLogicalPath(logicalPath)
    await mkdir(path.dirname(linkPath), { recursive: true })
    await symlink(pathForLogicalPath(targetLogicalPath), linkPath)
    return true
  } catch {
    return false
  }
}

function expectNoLeak(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain('owner-user')
  expect(serialized).not.toContain('manual-arsip/')
  expect(serialized).not.toContain('workflow/')
  expect(serialized).not.toContain('bukti-pembayaran')
  expect(serialized).not.toContain('bukti-manual')
  expect(serialized).not.toContain('duplicate.pdf')
  expect(serialized).not.toContain('secret.pdf')
  expect(serialized).not.toContain(TEST_ROOT)
  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('logicalPath')
  expect(serialized).not.toContain('physical_path')
  expect(serialized).not.toContain('physicalPath')
  expect(serialized).not.toContain('storage root')
  expect(serialized).not.toContain('signedUrl')
  expect(serialized).not.toContain('signed_url')
  expect(serialized).not.toContain('token')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('cookie')
  expect(serialized).not.toContain('session')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('SQL')
}
