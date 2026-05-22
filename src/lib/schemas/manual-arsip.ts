import { z } from 'zod'
import { ARCHIVE_STATUS_VALUES } from '#/lib/constants/archive-status'

const METADATA_FORBIDDEN_KEYS = new Set([
  'nama',
  'tanggal',
  'keterangan',
  'category_id',
  'categoryId',
  'klasifikasi_id',
  'klasifikasiId',
  'status_arsip',
  'statusArsip',
  'created_by',
  'createdBy',
  'logical_path',
  'logicalPath',
  'physical_path',
  'physicalPath',
  'storage_root',
  'storageRoot',
  'file_url',
  'fileUrl',
  'signed_url',
  'signedUrl',
  'token',
  'file_token',
  'fileToken',
])

export const manualArsipSafeMetadataSchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, ctx) => {
    const validation = validateSafeJsonObject(value)
    if (!validation.ok) {
      ctx.addIssue({
        code: 'custom',
        message: validation.message,
      })
    }
  })

export const createManualArsipSchema = z
  .object({
    nama: z.string().trim().min(1, 'Nama arsip wajib diisi').max(255),
    tanggal: z.string().refine(isValidDateOnly, 'Tanggal harus valid dengan format YYYY-MM-DD'),
    keterangan: z.string().trim().min(1, 'Keterangan wajib diisi'),
    category_id: z.string().uuid('Kategori tidak valid'),
    klasifikasi_id: z.string().uuid('Klasifikasi tidak valid').nullable().optional(),
    nominal_realisasi: z.number().finite('Nominal realisasi harus berupa angka').min(0, 'Nominal realisasi tidak boleh negatif').nullable().optional(),
    metadata: manualArsipSafeMetadataSchema.optional(),
  })
  .strict()

export const listManualArsipQuerySchema = z
  .object({
    category_id: z.string().uuid('Kategori tidak valid').optional(),
    klasifikasi_id: z.string().uuid('Klasifikasi tidak valid').optional(),
    status_arsip: z.enum(ARCHIVE_STATUS_VALUES).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(100),
  })
  .strict()

export type CreateManualArsipInput = z.infer<typeof createManualArsipSchema>
export type ListManualArsipQuery = z.infer<typeof listManualArsipQuerySchema>
export type ManualArsipSafeMetadata = z.infer<typeof manualArsipSafeMetadataSchema>

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

function validateSafeJsonObject(value: Record<string, unknown>): { ok: true } | { ok: false; message: string } {
  if (!isPlainObject(value)) {
    return { ok: false, message: 'Metadata harus berupa object JSON biasa' }
  }

  if (!isSafeJsonValue(value, 0)) {
    return { ok: false, message: 'Metadata hanya boleh berisi nilai JSON yang aman' }
  }

  if (hasForbiddenMetadataKey(value)) {
    return { ok: false, message: 'Metadata tidak boleh berisi field inti atau field akses file' }
  }

  return { ok: true }
}

function isSafeJsonValue(value: unknown, depth: number): boolean {
  if (depth > 8) return false
  if (value === null) return true

  const valueType = typeof value
  if (valueType === 'string' || valueType === 'boolean') return true
  if (valueType === 'number') return Number.isFinite(value)

  if (Array.isArray(value)) {
    return value.every((item) => isSafeJsonValue(item, depth + 1))
  }

  if (isPlainObject(value)) {
    return Object.entries(value).every(([key, item]) => (
      key !== '__proto__'
      && key !== 'constructor'
      && key !== 'prototype'
      && isSafeJsonValue(item, depth + 1)
    ))
  }

  return false
}

function hasForbiddenMetadataKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenMetadataKey)
  if (!isPlainObject(value)) return false

  return Object.entries(value).some(([key, item]) => (
    METADATA_FORBIDDEN_KEYS.has(key) || hasForbiddenMetadataKey(item)
  ))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
