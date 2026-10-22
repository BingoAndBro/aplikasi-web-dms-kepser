// Server-only module. Do not import from client components.
//
// Isi `DAFTAR_ISI.txt` di folder tautan Google Drive (murni). Dibangun hanya
// dari baris DB (D14) sehingga bisa ditulis ulang setelah pemusnahan atau
// hapus permanen dokumen. Tidak memuat logical path, path fisik, id, atau token.
import type { LaporanTautanDriveDilewati } from '#/db/schema/app/laporan-tautan'
import type {
  LaporanTautanDriveFileKeteranganHapus,
  LaporanTautanDriveFileStatus,
} from '#/db/schema/app/laporan-tautan-drive-file'

export type DriveDaftarIsiFile = {
  labelDokumen: string
  namaFile: string
  urutan: number
  status: LaporanTautanDriveFileStatus
  keteranganHapus: LaporanTautanDriveFileKeteranganHapus | null
}

export type DriveDaftarIsiInput = {
  judul: string
  sumberLabel: string
  dibagikanOleh: string | null
  diperbaruiPada: Date
  files: DriveDaftarIsiFile[]
  dilewati: LaporanTautanDriveDilewati[]
}

const KETERANGAN_LABEL: Partial<Record<LaporanTautanDriveFileKeteranganHapus, string>> = {
  DIMUSNAHKAN: 'telah dimusnahkan',
  DIBERSIHKAN: 'telah dibersihkan',
  DIHAPUS_PEMILIK: 'telah dihapus pemiliknya',
}

const waktuJakarta = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function formatWaktu(date: Date): string {
  const part = Object.fromEntries(waktuJakarta.formatToParts(date).map((p) => [p.type, p.value]))
  return `${part.year}-${part.month}-${part.day} ${part.hour}:${part.minute} WIB`
}

/** Satu baris: tanpa baris baru atau karakter kontrol dari teks bebas pengguna. */
function satuBaris(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function akhiranStatus(file: DriveDaftarIsiFile): string {
  const keterangan = file.keteranganHapus ? KETERANGAN_LABEL[file.keteranganHapus] : undefined
  if (keterangan) return ` (${keterangan})`
  return file.status === 'TERUNGGAH' ? '' : ' (tidak tersedia)'
}

export function buildDriveDaftarIsiText(input: DriveDaftarIsiInput): string {
  const groups = new Map<string, DriveDaftarIsiFile[]>()
  for (const file of [...input.files].sort((a, b) => a.urutan - b.urutan)) {
    const label = satuBaris(file.labelDokumen)
    groups.set(label, [...(groups.get(label) ?? []), file])
  }

  const lines: string[] = [
    'DAFTAR ISI TAUTAN GOOGLE DRIVE',
    `Judul: ${satuBaris(input.judul)}`,
    `Sumber: ${satuBaris(input.sumberLabel)}`,
    `Dibagikan oleh: ${input.dibagikanOleh ? satuBaris(input.dibagikanOleh) : '-'}`,
    `Diperbarui: ${formatWaktu(input.diperbaruiPada)}`,
    '',
    `Dokumen (${groups.size}):`,
  ]

  if (groups.size === 0) lines.push('(tidak ada)')
  for (const [label, files] of groups) {
    lines.push('', label)
    for (const file of files) lines.push(`- ${satuBaris(file.namaFile)}${akhiranStatus(file)}`)
  }

  lines.push('', `Dokumen tanpa lampiran tersedia (${input.dilewati.length}):`)
  if (input.dilewati.length === 0) lines.push('(tidak ada)')
  for (const item of input.dilewati) lines.push(`- ${satuBaris(item.label)} - ${satuBaris(item.alasan)}`)

  return `${lines.join('\n')}\n`
}
