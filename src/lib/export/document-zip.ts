// Server-only module. Do not import from client components.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { PassThrough, Readable } from 'node:stream'
import { ZipArchive } from 'archiver'

import {
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
  sanitizeStoragePathSegment,
} from '#/lib/storage/local-storage-paths'

export type DocumentZipFileInput = {
  namaAman: string
  logicalPath: string
}

export type DocumentZipEntry = {
  folderPath: string
  files: DocumentZipFileInput[]
}

export type DocumentZipPlanOptions = {
  requesterLabel: string
  requesterRole: string
  sourceDescription: string
  generatedAt?: Date
}

export type DocumentZipStreamOptions = DocumentZipPlanOptions & {
  filename: string
}

export type DocumentZipPlanFile = {
  finalName: string
  logicalPath: string
}

export type DocumentZipPlanFolder = {
  folderPath: string
  files: DocumentZipPlanFile[]
}

export type DocumentZipPlanSkipped = {
  label: string
  reason: string
}

export type DocumentZipPlan = {
  includedFolders: DocumentZipPlanFolder[]
  skipped: DocumentZipPlanSkipped[]
  daftarIsiText: string
}

type DocumentZipStat = { isFile(): boolean; size: number }

export type DocumentZipArchiveHandle = {
  append(source: unknown, data: { name: string }): unknown
  finalize(): unknown
  pipe(destination: NodeJS.WritableStream): unknown
  on(event: string, listener: (...args: unknown[]) => void): unknown
}

export type DocumentZipDeps = {
  root?: string
  stat?: (physicalPath: string) => Promise<DocumentZipStat>
  createReadStream?: (physicalPath: string) => NodeJS.ReadableStream
  createArchive?: () => DocumentZipArchiveHandle
}

const DOCUMENT_ZIP_MAX_ENTRIES = 500
const DOCUMENT_ZIP_MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024

export class DocumentZipTooManyEntriesError extends Error {
  readonly count: number
  readonly limit: number

  constructor(count: number, limit: number = DOCUMENT_ZIP_MAX_ENTRIES) {
    super(`Jumlah dokumen (${count}) melebihi batas maksimal ${limit} per ekspor.`)
    this.name = 'DocumentZipTooManyEntriesError'
    this.count = count
    this.limit = limit
  }
}

export function buildWorkflowDocumentFolderName({
  id,
  judul,
  tanggal,
}: {
  id: string
  judul: string
  tanggal: string
}): string {
  const datePart = tanggal.slice(0, 10)
  const judulPart = safeFolderSegment(judul, 'Dokumen')

  return `${datePart}_${judulPart}_${id.slice(0, 8)}`
}

export function buildManualDocumentFolderName({
  id,
  judul,
}: {
  id: string
  judul: string
}): string {
  const judulPart = safeFolderSegment(judul, 'Dokumen')

  return `[Manual] ${judulPart}_${id.slice(0, 8)}`
}

export function buildBerkasParentFolderName({
  nomorSpm,
  klasifikasiNama,
  tahunAnggaran,
}: {
  nomorSpm: string | null | undefined
  klasifikasiNama: string
  tahunAnggaran: number
}): string {
  const nomorPart = nomorSpm && nomorSpm.trim() ? safeFolderSegment(nomorSpm, '') : ''
  const klasifikasiPart = safeFolderSegment(klasifikasiNama, 'Tanpa Klasifikasi')

  return `${nomorPart || '[Tanpa Nomor SPM]'} - ${klasifikasiPart} - TA ${tahunAnggaran}`
}

/**
 * Pure planning pass: no filesystem access. Resolves final (de-duplicated) file
 * names per folder and separates entries without attachments into the skip list.
 */
export function buildZipPlan(
  entries: DocumentZipEntry[],
  options: DocumentZipPlanOptions,
): DocumentZipPlan {
  if (entries.length > DOCUMENT_ZIP_MAX_ENTRIES) {
    throw new DocumentZipTooManyEntriesError(entries.length)
  }

  const includedFolders: DocumentZipPlanFolder[] = []
  const skipped: DocumentZipPlanSkipped[] = []

  for (const entry of entries) {
    if (entry.files.length === 0) {
      skipped.push({ label: entry.folderPath, reason: 'tanpa lampiran' })
      continue
    }

    const seenNames = new Map<string, number>()
    const files: DocumentZipPlanFile[] = entry.files.map(file => ({
      finalName: nextAvailableFileName(file.namaAman, seenNames),
      logicalPath: file.logicalPath,
    }))

    includedFolders.push({ folderPath: entry.folderPath, files })
  }

  const generatedAt = options.generatedAt ?? new Date()
  const daftarIsiText = renderDaftarIsiText({
    requesterLabel: options.requesterLabel,
    requesterRole: options.requesterRole,
    sourceDescription: options.sourceDescription,
    generatedAt,
    includedFolders: includedFolders.map(folder => ({
      folderPath: folder.folderPath,
      fileCount: folder.files.length,
    })),
    skipped,
  })

  return { includedFolders, skipped, daftarIsiText }
}

/**
 * Thin I/O layer: resolves physical paths, stats each planned file (skipping
 * missing/oversized ones), and streams a `.zip` Response via archiver + PassThrough.
 */
export async function streamDocumentZip(
  entries: DocumentZipEntry[],
  options: DocumentZipStreamOptions,
  deps: DocumentZipDeps = {},
): Promise<Response> {
  const generatedAt = options.generatedAt ?? new Date()
  const plan = buildZipPlan(entries, { ...options, generatedAt })

  const root = deps.root ?? getLocalStorageRoot()
  const statFn = deps.stat ?? ((physicalPath: string) => stat(physicalPath))
  const createReadStreamFn = deps.createReadStream ?? ((physicalPath: string) => createReadStream(physicalPath))
  const createArchiveFn = deps.createArchive ?? defaultCreateArchive

  const toAppend: Array<{ folderPath: string; finalName: string; physicalPath: string }> = []
  const extraSkipped: DocumentZipPlanSkipped[] = []
  const finalIncludedFolders: DocumentZipPlanFolder[] = []

  for (const folder of plan.includedFolders) {
    const includedFiles: DocumentZipPlanFile[] = []

    for (const file of folder.files) {
      const label = `${folder.folderPath}/${file.finalName}`

      let physicalPath: string
      try {
        physicalPath = resolvePhysicalStoragePath(root, file.logicalPath)
      } catch {
        extraSkipped.push({ label, reason: 'file tidak ditemukan' })
        continue
      }

      let fileStat: DocumentZipStat
      try {
        fileStat = await statFn(physicalPath)
      } catch {
        extraSkipped.push({ label, reason: 'file tidak ditemukan' })
        continue
      }

      if (!fileStat.isFile()) {
        extraSkipped.push({ label, reason: 'file tidak ditemukan' })
        continue
      }

      if (fileStat.size > DOCUMENT_ZIP_MAX_FILE_SIZE_BYTES) {
        extraSkipped.push({ label, reason: 'melebihi 250 MB' })
        continue
      }

      includedFiles.push(file)
      toAppend.push({ folderPath: folder.folderPath, finalName: file.finalName, physicalPath })
    }

    if (includedFiles.length > 0) {
      finalIncludedFolders.push({ folderPath: folder.folderPath, files: includedFiles })
    } else if (folder.files.length > 0) {
      extraSkipped.push({ label: folder.folderPath, reason: 'semua lampiran tidak dapat diakses' })
    }
  }

  const finalSkipped = [...plan.skipped, ...extraSkipped]
  const daftarIsiText = renderDaftarIsiText({
    requesterLabel: options.requesterLabel,
    requesterRole: options.requesterRole,
    sourceDescription: options.sourceDescription,
    generatedAt,
    includedFolders: finalIncludedFolders.map(folder => ({
      folderPath: folder.folderPath,
      fileCount: folder.files.length,
    })),
    skipped: finalSkipped,
  })

  const archive = createArchiveFn()
  const passthrough = new PassThrough()
  archive.pipe(passthrough)

  let earlyError: Error | null = null
  // A listener is required or Node rethrows synchronously when we destroy()
  // the stream below on a fatal archive error.
  passthrough.on('error', () => {})
  archive.on('warning', () => {
    // Non-fatal archiver warnings (e.g. a stat race on an already-checked file)
    // must not abort an otherwise-successful export.
  })
  archive.on('error', (err) => {
    if (earlyError === null) {
      earlyError = err instanceof Error ? err : new Error(String(err))
    }
    passthrough.destroy(earlyError)
  })

  archive.append(Buffer.from(daftarIsiText, 'utf-8'), { name: 'DAFTAR_ISI.txt' })
  for (const file of toAppend) {
    archive.append(createReadStreamFn(file.physicalPath), { name: `${file.folderPath}/${file.finalName}` })
  }

  // archive.finalize() may emit 'error' synchronously (real archiver input
  // validation, or a test double) before any bytes are read — checked here so
  // that case surfaces as a rejection instead of a silently-empty Response.
  Promise.resolve(archive.finalize()).catch(() => {})

  if (earlyError) {
    throw earlyError
  }

  const headers = new Headers({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${sanitizeContentDispositionFilename(options.filename)}"`,
    'Cache-Control': 'no-store',
  })

  return new Response(Readable.toWeb(passthrough) as unknown as ReadableStream, {
    status: 200,
    headers,
  })
}

function defaultCreateArchive(): DocumentZipArchiveHandle {
  return new ZipArchive({ zlib: { level: 9 } }) as unknown as DocumentZipArchiveHandle
}

function nextAvailableFileName(namaAman: string, seen: Map<string, number>): string {
  const count = seen.get(namaAman) ?? 0
  seen.set(namaAman, count + 1)

  return count === 0 ? namaAman : insertNameSuffix(namaAman, count + 1)
}

function insertNameSuffix(name: string, suffix: number): string {
  const lastDotIndex = name.lastIndexOf('.')
  if (lastDotIndex <= 0) return `${name} (${suffix})`

  return `${name.slice(0, lastDotIndex)} (${suffix})${name.slice(lastDotIndex)}`
}

function safeFolderSegment(value: string, fallback: string): string {
  try {
    return sanitizeStoragePathSegment(value)
  } catch {
    return fallback
  }
}

function sanitizeContentDispositionFilename(filename: string): string {
  const sanitized = filename.trim().replace(/["\r\n]/g, '_')

  return sanitized || 'export.zip'
}

type DaftarIsiInput = {
  requesterLabel: string
  requesterRole: string
  sourceDescription: string
  generatedAt: Date
  includedFolders: Array<{ folderPath: string; fileCount: number }>
  skipped: DocumentZipPlanSkipped[]
}

function renderDaftarIsiText(input: DaftarIsiInput): string {
  const lines: string[] = [
    'DAFTAR ISI EKSPOR ZIP',
    `Waktu ekspor: ${input.generatedAt.toISOString()}`,
    `Diminta oleh: ${input.requesterLabel} (${input.requesterRole})`,
    `Sumber: ${input.sourceDescription}`,
    '',
    `Dokumen disertakan (${input.includedFolders.length}):`,
  ]

  if (input.includedFolders.length === 0) {
    lines.push('(tidak ada)')
  } else {
    for (const folder of input.includedFolders) {
      lines.push(`- ${folder.folderPath} (${folder.fileCount} file)`)
    }
  }

  lines.push('', `Dokumen dilewati (${input.skipped.length}):`)

  if (input.skipped.length === 0) {
    lines.push('(tidak ada)')
  } else {
    for (const skip of input.skipped) {
      lines.push(`- ${skip.label} - ${skip.reason}`)
    }
  }

  return `${lines.join('\n')}\n`
}
