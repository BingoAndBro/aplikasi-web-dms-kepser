import { BERKAS_ACTIVITY_EVENT_LABELS } from '#/lib/archive/berkas-arsip-activity'
import type { RoleName } from '#/lib/constants/roles'

// Human-readable labels for `log_aktivitas.aksi` values, merged with
// `arsip.berkas_arsip_activity`'s event-type labels (BERKAS_DIBUKA, etc.) so
// the shared Activity Log list page can format both families of aksi codes
// through one function. Kept independent from `ActivityLog.tsx`'s
// AKSI_CONFIG (which also carries icon/color per aksi) so this mapping can
// change without touching the tested per-document activity widget.
export const AKSI_LABELS: Record<string, string> = {
  SUBMIT: 'Diajukan ke PPK',
  APPROVE: 'Disetujui',
  REJECT: 'Ditolak',
  PPK_APPROVE: 'Divalidasi oleh PPK',
  PPK_REJECT: 'Ditolak oleh PPK',
  PPSPM_APPROVE: 'Disetujui PPSPM',
  PPSPM_REJECT: 'Dikembalikan PPSPM',
  // Legacy aksi values from before the bendahara->ppspm rename. log_aktivitas
  // is append-only, so historical rows keep the old literal forever.
  BENDAHARA_APPROVE: 'Disetujui PPSPM',
  BENDAHARA_REJECT: 'Dikembalikan PPSPM',
  RESUBMIT: 'Diajukan ulang ke PPK',
  RESUBMIT_PPK: 'Diajukan ulang ke PPSPM',
  PPK_KEMBALIKAN: 'Dikembalikan ke Pegawai',
  ARCHIVE: 'Diarsipkan',
  STORE: 'Laporan kegiatan disimpan',
  UPDATE: 'Lampiran diperbarui',
  DELETE: 'Dokumen dihapus',
  ...BERKAS_ACTIVITY_EVENT_LABELS,
}

export function formatAksiLabel(aksi: string): string {
  return AKSI_LABELS[aksi] ?? aksi
}

// `log_aktivitas` has no role column — each `aksi` value is only ever written
// by one specific role's endpoint (see the route files under
// src/routes/api/{ppk,ppspm}/... and src/routes/api/dokumen.$id*.ts), so the
// role can be derived from the aksi itself without a schema change.
const AKSI_ROLE: Record<string, RoleName> = {
  SUBMIT: 'PEGAWAI',
  STORE: 'PEGAWAI',
  RESUBMIT: 'PEGAWAI',
  UPDATE: 'PEGAWAI',
  DELETE: 'PEGAWAI',
  DOKUMEN_DIHAPUS_PERMANEN: 'PEGAWAI',
  PPK_APPROVE: 'PPK',
  PPK_REJECT: 'PPK',
  PPK_KEMBALIKAN: 'PPK',
  RESUBMIT_PPK: 'PPK',
  PPSPM_APPROVE: 'PPSPM',
  PPSPM_REJECT: 'PPSPM',
  BENDAHARA_APPROVE: 'PPSPM',
  BENDAHARA_REJECT: 'PPSPM',
}

/**
 * Resolves the role that performed a logged aksi. `UPDATE_NOMINAL` is the one
 * aksi shared by two roles (PATCH /api/dokumen/:id/nominal allows either the
 * document's own creator, always PEGAWAI, or a KEPALA_SUB_BAGIAN_UMUM user) —
 * disambiguated by comparing the log's actor against the document's creator.
 * Returns null for any aksi with no known role (defensive default).
 */
export function resolveAksiRole(
  aksi: string,
  context: { actorId: string; dokumenCreatedBy: string },
): RoleName | null {
  if (aksi === 'UPDATE_NOMINAL') {
    return context.actorId === context.dokumenCreatedBy ? 'PEGAWAI' : 'KEPALA_SUB_BAGIAN_UMUM'
  }

  return AKSI_ROLE[aksi] ?? null
}
