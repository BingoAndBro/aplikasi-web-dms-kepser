import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  assertSafeLogicalStoragePath,
  classifyStoragePath,
  getFileExtension,
  getLogicalPathOwnerId,
  isDashPendingPath,
  isUploadApiPendingPath,
  normalizeLogicalStoragePath,
  resolvePhysicalStoragePath,
  resolveStorageRoot,
  sanitizeStorageFilename,
  sanitizeStoragePathSegment,
  storagePathBelongsToUser,
} from '#/lib/storage/local-storage-paths'

describe('local storage path helpers', () => {
  describe('logical path validation', () => {
    it('normalizes simple logical paths', () => {
      expect(normalizeLogicalStoragePath('user-id/folder/file.pdf')).toBe('user-id/folder/file.pdf')
    })

    it('converts backslashes to slashes and collapses duplicate separators', () => {
      expect(normalizeLogicalStoragePath('user-id\\\\folder///file.pdf')).toBe('user-id/folder/file.pdf')
    })

    it('strips leading slashes for bucket-style logical paths', () => {
      expect(normalizeLogicalStoragePath('/user-id/file.pdf')).toBe('user-id/file.pdf')
    })

    it('rejects traversal and dot segments', () => {
      expect(() => normalizeLogicalStoragePath('../outside.pdf')).toThrow('traversal')
      expect(() => normalizeLogicalStoragePath('user-id/../outside.pdf')).toThrow('traversal')
      expect(() => normalizeLogicalStoragePath('user-id/./file.pdf')).toThrow('dot')
    })

    it('rejects empty paths', () => {
      expect(() => normalizeLogicalStoragePath('')).toThrow('non-empty')
      expect(() => normalizeLogicalStoragePath('   ')).toThrow('non-empty')
    })

    it('rejects URL-like paths', () => {
      expect(() => normalizeLogicalStoragePath('http://example.test/file.pdf')).toThrow('URL')
      expect(() => normalizeLogicalStoragePath('file:///tmp/file.pdf')).toThrow('URL')
      expect(() => normalizeLogicalStoragePath('//example.test/file.pdf')).toThrow('network')
    })

    it('rejects Windows drive-letter paths', () => {
      expect(() => normalizeLogicalStoragePath('C:\\temp\\file.pdf')).toThrow('Windows absolute path')
      expect(() => normalizeLogicalStoragePath('D:/temp/file.pdf')).toThrow('Windows absolute path')
    })

    it('returns the normalized value from the assertion helper', () => {
      expect(assertSafeLogicalStoragePath('user-id//file.pdf')).toBe('user-id/file.pdf')
    })
  })

  describe('storage root and physical path resolution', () => {
    it('resolves a non-empty storage root without creating it', () => {
      const resolvedRoot = resolveStorageRoot('storage')

      expect(path.isAbsolute(resolvedRoot)).toBe(true)
      expect(resolvedRoot.endsWith(`${path.sep}storage`)).toBe(true)
    })

    it('rejects empty storage roots', () => {
      expect(() => resolveStorageRoot('')).toThrow('non-empty')
      expect(() => resolveStorageRoot('   ')).toThrow('non-empty')
    })

    it('rejects public/static storage roots', () => {
      expect(() => resolveStorageRoot(path.join('public', 'storage'))).toThrow('public/static')
      expect(() => resolveStorageRoot(path.join('static', 'uploads'))).toThrow('public/static')
    })

    it('resolves a physical path under a test root', () => {
      const root = path.resolve('.tmp', 'storage-path-test-root')
      const physicalPath = resolvePhysicalStoragePath(root, 'user-id/document-id/file.pdf')

      expect(physicalPath).toBe(path.join(root, 'user-id', 'document-id', 'file.pdf'))
    })

    it('rejects traversal escaping a root', () => {
      const root = path.resolve('.tmp', 'storage-path-test-root')

      expect(() => resolvePhysicalStoragePath(root, 'user-id/../../outside.pdf')).toThrow('traversal')
    })
  })

  describe('filename and segment helpers', () => {
    it('sanitizes filenames like the current upload behavior', () => {
      expect(sanitizeStorageFilename('Daftar Absensi (Final):v1.pdf')).toBe('Daftar_Absensi__Final__v1.pdf')
    })

    it('preserves safe extensions while replacing unsafe characters', () => {
      expect(sanitizeStorageFilename('laporan final.PDF')).toBe('laporan_final.PDF')
      expect(getFileExtension('folder/laporan final.PDF')).toBe('pdf')
    })

    it('rejects filenames that are unsafe after sanitization', () => {
      expect(() => sanitizeStorageFilename('...')).toThrow('alphanumeric')
      expect(() => sanitizeStorageFilename('   ')).toThrow('non-empty')
    })

    it('sanitizes logical path segments', () => {
      expect(sanitizeStoragePathSegment('user-custom:abc/def')).toBe('user-custom_abc_def')
    })

    it('extracts lowercase extensions without a leading dot', () => {
      expect(getFileExtension('document.PDF')).toBe('pdf')
      expect(getFileExtension('archive.tar.gz')).toBe('gz')
      expect(getFileExtension('document')).toBe('')
      expect(getFileExtension('.hidden')).toBe('')
    })
  })

  describe('path ownership and classification', () => {
    it('extracts owner id from the first logical segment', () => {
      expect(getLogicalPathOwnerId('owner-id/path/file.pdf')).toBe('owner-id')
    })

    it('checks owner id against the first logical segment', () => {
      expect(storagePathBelongsToUser('owner-id/path/file.pdf', 'owner-id')).toBe(true)
      expect(storagePathBelongsToUser('owner-id/path/file.pdf', 'other-user')).toBe(false)
      expect(storagePathBelongsToUser('owner-id/path/file.pdf', '   ')).toBe(false)
    })

    it('classifies dash pending paths', () => {
      const storagePath = 'user-id/1778064971564-caqghvva3no-Daftar_Absensi.pdf'

      expect(isDashPendingPath(storagePath)).toBe(true)
      expect(classifyStoragePath(storagePath)).toBe('pending-dash')
    })

    it('classifies upload API pending paths', () => {
      const storagePath = 'user-id/11111111-1111-4111-8111-111111111111_1778064971564_Daftar_Absensi.pdf'

      expect(isUploadApiPendingPath(storagePath)).toBe(true)
      expect(classifyStoragePath(storagePath)).toBe('pending-upload-api')
    })

    it('classifies formal paths', () => {
      const storagePath = 'user-id/document-id/3c86de66-1111-4111-8111-111111111111.pdf'

      expect(classifyStoragePath(storagePath)).toBe('formal')
    })

    it('classifies unrecognized safe paths as other', () => {
      expect(classifyStoragePath('user-id/notes/readme.txt')).toBe('other')
    })
  })
})
