import { describe, expect, it } from 'vitest'

import {
  getStatusBadgeConfig,
  DOCUMENT_STATUS_BADGE_CONFIG,
  ARCHIVE_STATUS_BADGE_CONFIG,
  FOLDER_STATUS_BADGE_CONFIG,
  SOURCE_TYPE_BADGE_CONFIG,
} from '#/components/ui/StatusBadge'
import { getRoleBadgeLabel, ROLE_BADGE_LABELS } from '#/components/ui/RoleBadge'

describe('Phase 15E shared UI foundation mappings', () => {
  it('uses canonical document status labels without prototype-only statuses', () => {
    expect(DOCUMENT_STATUS_BADGE_CONFIG.DRAFT.label).toBe('Draft')
    expect(DOCUMENT_STATUS_BADGE_CONFIG.IN_PPK_VALIDATION.label).toBe('Menunggu PPK')
    expect(DOCUMENT_STATUS_BADGE_CONFIG.IN_BENDAHARA_APPROVAL.label).toBe('Menunggu PPSPM')
    expect(DOCUMENT_STATUS_BADGE_CONFIG.NEED_REVISION.label).toBe('Perlu Revisi')
    expect(DOCUMENT_STATUS_BADGE_CONFIG.COMPLETED.label).toBe('Selesai')
    expect(DOCUMENT_STATUS_BADGE_CONFIG.TERSIMPAN.label).toBe('Tersimpan')
    expect(DOCUMENT_STATUS_BADGE_CONFIG).not.toHaveProperty('IN_REVIEW')
    expect(DOCUMENT_STATUS_BADGE_CONFIG).not.toHaveProperty('ARCHIVED')
    expect(getStatusBadgeConfig('ARCHIVED', 'document').label).toBe('Status tidak dikenal')
  })

  it('uses canonical folder, lifecycle, and source labels', () => {
    expect(FOLDER_STATUS_BADGE_CONFIG.OPEN.label).toBe('Berkas Terbuka')
    expect(FOLDER_STATUS_BADGE_CONFIG.CLOSED.label).toBe('Berkas Ditutup')
    // RP-01 de-arsip: label lifecycle disederhanakan; entri INAKTIF dibuang.
    expect(ARCHIVE_STATUS_BADGE_CONFIG.AKTIF.label).toBe('Tersimpan')
    expect(ARCHIVE_STATUS_BADGE_CONFIG).not.toHaveProperty('INAKTIF')
    expect(ARCHIVE_STATUS_BADGE_CONFIG.USUL_MUSNAH.label).toBe('Usul Pembersihan')
    expect(ARCHIVE_STATUS_BADGE_CONFIG.DIMUSNAHKAN.label).toBe('File Dibersihkan')
    expect(getStatusBadgeConfig('INAKTIF', 'archive').label).toBe('Status tidak dikenal')
    expect(SOURCE_TYPE_BADGE_CONFIG.WORKFLOW.label).toBe('Persetujuan')
    expect(SOURCE_TYPE_BADGE_CONFIG.MANUAL.label).toBe('Manual')
  })

  it('falls back safely for unknown status values', () => {
    expect(getStatusBadgeConfig('INVALID', 'document').label).toBe('Status tidak dikenal')
    expect(getStatusBadgeConfig(null, 'archive').label).toBe('Status tidak dikenal')
  })

  it('uses Phase 15 role display labels without changing internal values', () => {
    expect(ROLE_BADGE_LABELS.PEGAWAI).toBe('Pegawai')
    expect(ROLE_BADGE_LABELS.PPK).toBe('PPK')
    expect(ROLE_BADGE_LABELS.BENDAHARA).toBe('PPSPM')
    expect(ROLE_BADGE_LABELS.KEPALA_SUB_BAGIAN_UMUM).toBe('Kepala Sub Bagian Umum')
    expect(ROLE_BADGE_LABELS.PENANGGUNG_JAWAB_KINERJA).toBe('Penanggung Jawab Kinerja')
    expect(ROLE_BADGE_LABELS.ADMIN).toBe('Admin Sistem')
    expect(getRoleBadgeLabel('BENDAHARA')).toBe('PPSPM')
    expect(getRoleBadgeLabel('ADMIN')).toBe('Admin Sistem')
    expect(getRoleBadgeLabel('LOWERCASE_PROTOTYPE_ROLE')).toBe('Role tidak dikenal')
  })
})
