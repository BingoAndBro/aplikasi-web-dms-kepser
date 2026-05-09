import { describe, it, expect } from 'vitest'
import { sanitizeFilename, extractExtension, extractFilenameFromPath, isPendingFile } from '#/lib/utils/file'

describe('file utils', () => {
  describe('sanitizeFilename', () => {
    it('removes invalid characters', () => {
      expect(sanitizeFilename('my/file:name*is?invalid"<>|')).toBe('my_file_name_is_invalid_')
    })

    it('collapses multiple underscores', () => {
      expect(sanitizeFilename('file///name')).toBe('file_name')
    })
  })

  describe('extractExtension', () => {
    it('extracts extension correctly', () => {
      expect(extractExtension('document.pdf')).toBe('pdf')
      expect(extractExtension('archive.tar.gz')).toBe('gz')
    })

    it('returns empty string if no extension', () => {
      expect(extractExtension('document')).toBe('')
      expect(extractExtension('.hidden')).toBe('') // Assuming hidden files don't have extension per this logic
    })
  })

  describe('extractFilenameFromPath', () => {
    it('extracts regular filename', () => {
      expect(extractFilenameFromPath('folder/subfolder/file.txt')).toBe('file.txt')
    })

    it('extracts original filename from pending format', () => {
      // Format: 1778064971564-caqghvva3no-Daftar_Absensi.pdf
      expect(extractFilenameFromPath('user-id/1778064971564-caqghvva3no-Daftar_Absensi.pdf')).toBe('Daftar_Absensi.pdf')
    })
  })

  describe('isPendingFile', () => {
    it('identifies pending files', () => {
      expect(isPendingFile('user-id/1778064971564-caqghvva3no-Daftar_Absensi.pdf')).toBe(true)
    })

    it('identifies formal files as non-pending', () => {
      expect(isPendingFile('user-id/dok-id/3c86de66.pdf')).toBe(false)
      expect(isPendingFile('formal_document.pdf')).toBe(false)
    })
  })
})
