// Server-only module. Do not import from client components.
//
// Rencana baris `laporan_tautan_drive_file` dari entri ZIP (murni, tanpa I/O).
// Nama file formal sama dengan isi ZIP; karena folder tautan Drive rata (P3),
// nama ganda di-dedup di tingkat folder tautan dengan aturan ZIP yang sama dan
// nama final disimpan saat tautan dibuat. Logical path tidak ikut disimpan:
// dicari ulang saat unggah supaya status terkini (dimusnahkan/dibersihkan) berlaku.
import type { LaporanTautanDriveDilewati } from '#/db/schema/app/laporan-tautan'
import type { LaporanTautanDriveFileSumber } from '#/db/schema/app/laporan-tautan-drive-file'
import { nextAvailableFileName, type DocumentZipEntry } from '#/lib/export/document-zip'
import { inferContentType } from '#/lib/storage/internal-file-access'

export const DRIVE_DAFTAR_ISI_NAMA = 'DAFTAR_ISI.txt'
const ALASAN_TANPA_LAMPIRAN = 'tanpa lampiran tersedia'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const KUNCI_DOKUMEN = new RegExp(`^DOKUMEN:(${UUID}):(\\d+)$`, 'i')
const KUNCI_MANUAL = new RegExp(`^MANUAL:(${UUID}):(${UUID})$`, 'i')

export type RencanaFileDrive = {
  sumber: LaporanTautanDriveFileSumber
  dokumenId: string | null
  lampiranIndex: number | null
  manualArsipId: string | null
  attachmentId: string | null
  kunci: string
  namaFile: string
  labelDokumen: string
  urutan: number
  contentType: string
}

type SumberKunci = Pick<RencanaFileDrive, 'sumber' | 'dokumenId' | 'lampiranIndex' | 'manualArsipId' | 'attachmentId'>

function parseKunci(kunci: string | undefined): SumberKunci {
  const dokumen = kunci ? KUNCI_DOKUMEN.exec(kunci) : null
  if (dokumen) {
    return { sumber: 'DOKUMEN', dokumenId: dokumen[1], lampiranIndex: Number(dokumen[2]), manualArsipId: null, attachmentId: null }
  }
  const manual = kunci ? KUNCI_MANUAL.exec(kunci) : null
  if (manual) {
    return { sumber: 'MANUAL_ARSIP', dokumenId: null, lampiranIndex: null, manualArsipId: manual[1], attachmentId: manual[2] }
  }
  // Semua pembuat entri ZIP mengisi kunci (laporan-zip-entries.ts); ini galat program.
  throw new Error('Entri ZIP tanpa kunci lampiran yang sah')
}

export function rencanakanFileDrive(entries: DocumentZipEntry[]): {
  files: RencanaFileDrive[]
  dilewati: LaporanTautanDriveDilewati[]
} {
  const files: RencanaFileDrive[] = []
  const dilewati: LaporanTautanDriveDilewati[] = []
  // DAFTAR_ISI.txt dipesan lebih dulu supaya lampiran bernama sama mendapat akhiran.
  const seenNames = new Map<string, number>([[DRIVE_DAFTAR_ISI_NAMA, 1]])
  const seenKunci = new Set<string>()

  for (const entry of entries) {
    if (entry.files.length === 0) {
      dilewati.push({ label: entry.folderPath, alasan: entry.skipReason ?? ALASAN_TANPA_LAMPIRAN })
      continue
    }

    for (const file of entry.files) {
      const sumber = parseKunci(file.kunci)
      const kunci = file.kunci as string
      if (seenKunci.has(kunci)) continue
      seenKunci.add(kunci)

      files.push({
        ...sumber,
        kunci,
        namaFile: nextAvailableFileName(file.namaAman, seenNames),
        labelDokumen: entry.folderPath,
        urutan: files.length,
        contentType: inferContentType(file.logicalPath),
      })
    }
  }

  return { files, dilewati }
}
