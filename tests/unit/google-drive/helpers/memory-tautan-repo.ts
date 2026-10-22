// TautanDriveRepository + data akun in-memory untuk tes handler/runner Drive.
// Meniru update bersyarat implementasi DB (tautan-drive-repository.ts) dan
// mencatat urutan panggilan di `events` agar tes bisa memeriksa urutan
// relatif terhadap panggilan FakeDrive.
import type { LaporanTautanDriveDilewati, LaporanTautanDriveStatus } from '#/db/schema/app/laporan-tautan'
import type {
  LaporanTautanDriveFileKeteranganHapus,
  LaporanTautanDriveFileStatus,
} from '#/db/schema/app/laporan-tautan-drive-file'
import type { AkunUntukJob } from '#/lib/google-drive/akun-repository'
import type {
  BarisFileUnggah,
  HapusDriveRepository,
  TautanDriveRepository,
  TautanUntukSinkron,
} from '#/lib/google-drive/tautan-drive-repository'

export type MemTautan = TautanUntukSinkron & {
  driveFolderUrl: string | null
  dilewati: LaporanTautanDriveDilewati[]
}

export type MemFile = BarisFileUnggah & {
  labelDokumen: string
  urutan: number
  status: LaporanTautanDriveFileStatus
  keteranganHapus: LaporanTautanDriveFileKeteranganHapus | null
  driveFileId: string | null
  diunggahPada: Date | null
  dihapusPada?: Date | null
}

type Hook = (...args: unknown[]) => void | Promise<void>

export const TAUTAN_ID = '77777777-7777-4777-8777-777777777777'
export const AKUN_ID = '22222222-2222-4222-8222-222222222222'

type RepoMethod = keyof TautanDriveRepository | keyof HapusDriveRepository

export class MemoryTautanRepo implements TautanDriveRepository, HapusDriveRepository {
  readonly tautan = new Map<string, MemTautan>()
  readonly files: MemFile[] = []
  readonly enqueued: Array<{ jenis: 'HAPUS_FILE'; tautanId: string; akunId: string }> = []
  readonly audits: Array<{ aksi: string; entityId: string; metadata: Record<string, unknown> }> = []
  readonly jobSelesai: string[] = []
  readonly events: string[] = []
  /** Dipanggil di awal method dengan argumennya (mis. untuk mencabut tautan di tengah unggah). */
  readonly hooks: Partial<Record<RepoMethod, Hook>> = {}

  addTautan(overrides: Partial<MemTautan> = {}): MemTautan {
    const row: MemTautan = {
      id: TAUTAN_ID,
      judul: 'Bukti Dukung Q3',
      createdAt: new Date('2026-10-20T20:00:00.000Z'),
      revokedAt: null,
      driveAkunId: AKUN_ID,
      driveStatus: 'MENUNGGU',
      driveFolderId: null,
      driveFolderDicobaPada: null,
      driveDaftarIsiFileId: null,
      driveFolderUrl: null,
      dilewati: [],
      ...overrides,
    }
    this.tautan.set(row.id, row)
    return row
  }

  addFile(index: number, overrides: Partial<MemFile> = {}): MemFile {
    const dokumenId = `3333333${index}-3333-4333-8333-333333333333`
    const row: MemFile = {
      id: `file-${index}`,
      tautanId: TAUTAN_ID,
      sumber: 'DOKUMEN',
      dokumenId,
      lampiranIndex: 0,
      manualArsipId: null,
      attachmentId: null,
      kunciLampiran: `DOKUMEN:${dokumenId}:0`,
      namaFile: `Lampiran ${index}.pdf`,
      contentType: 'application/pdf',
      dicobaPada: null,
      labelDokumen: `Dokumen ${index}`,
      urutan: index,
      status: 'MENUNGGU',
      keteranganHapus: null,
      driveFileId: null,
      diunggahPada: null,
      ...overrides,
    }
    this.files.push(row)
    return row
  }

  file(id: string): MemFile {
    const row = this.files.find((f) => f.id === id)
    if (!row) throw new Error(`file ${id} tidak ada`)
    return row
  }

  private async enter(method: RepoMethod, args: unknown[]) {
    this.events.push(method)
    await this.hooks[method]?.(...args)
  }

  private get(id: string): MemTautan {
    const row = this.tautan.get(id)
    if (!row) throw new Error(`tautan ${id} tidak ada`)
    return row
  }

  async muatTautanUntukSinkron(id: string) {
    await this.enter('muatTautanUntukSinkron', [id])
    const row = this.tautan.get(id)
    if (!row) return null
    const { driveFolderUrl: _url, dilewati: _d, ...rest } = row
    return { ...rest }
  }

  async setDriveStatus(id: string, { dari, ke }: { dari: LaporanTautanDriveStatus[]; ke: LaporanTautanDriveStatus }) {
    await this.enter('setDriveStatus', [id, { dari, ke }])
    const row = this.get(id)
    if (row.revokedAt || !row.driveStatus || !dari.includes(row.driveStatus)) return false
    row.driveStatus = ke
    return true
  }

  async simpanFolderDicoba(id: string, now: Date) {
    await this.enter('simpanFolderDicoba', [id, now])
    this.get(id).driveFolderDicobaPada = now
  }

  async simpanFolderId(id: string, folderId: string) {
    await this.enter('simpanFolderId', [id, folderId])
    this.get(id).driveFolderId = folderId
  }

  async ambilBarisMenungguBerikut(tautanId: string) {
    await this.enter('ambilBarisMenungguBerikut', [tautanId])
    const row = this.files
      .filter((f) => f.tautanId === tautanId && f.status === 'MENUNGGU')
      .sort((a, b) => a.kunciLampiran.localeCompare(b.kunciLampiran))[0]
    if (!row) return null
    const { labelDokumen: _l, urutan: _u, status: _s, keteranganHapus: _k, driveFileId: _f, diunggahPada: _p, ...baris } = row
    return { ...baris }
  }

  async tandaiBarisDicoba(id: string, now: Date) {
    await this.enter('tandaiBarisDicoba', [id, now])
    this.file(id).dicobaPada = now
  }

  async tandaiBarisTerunggah(id: string, driveFileId: string, now: Date) {
    await this.enter('tandaiBarisTerunggah', [id, driveFileId, now])
    const row = this.file(id)
    if (row.status !== 'MENUNGGU') return false
    Object.assign(row, { status: 'TERUNGGAH', driveFileId, diunggahPada: now })
    return true
  }

  async tandaiBarisDilewati(id: string) {
    await this.enter('tandaiBarisDilewati', [id])
    const row = this.file(id)
    if (row.status !== 'MENUNGGU') return false
    row.status = 'DILEWATI'
    return true
  }

  async pindahkanUnggahanTerbangKeMenghapus(input: { barisId: string; tautanId: string; akunId: string; driveFileId: string; now: Date }) {
    await this.enter('pindahkanUnggahanTerbangKeMenghapus', [input])
    const row = this.file(input.barisId)
    if (row.status !== 'DILEWATI') return false
    Object.assign(row, { status: 'MENGHAPUS', driveFileId: input.driveFileId, diunggahPada: input.now })
    this.enqueued.push({ jenis: 'HAPUS_FILE', tautanId: input.tautanId, akunId: input.akunId })
    return true
  }

  async simpanDaftarIsiFileId(id: string, fileId: string) {
    await this.enter('simpanDaftarIsiFileId', [id, fileId])
    this.get(id).driveDaftarIsiFileId = fileId
  }

  async muatDataDaftarIsi(tautanId: string) {
    await this.enter('muatDataDaftarIsi', [tautanId])
    const row = this.tautan.get(tautanId)
    if (!row) return null
    return {
      judul: row.judul,
      sumberLabel: 'Laporan Kegiatan',
      dibagikanOleh: 'Budi Santoso',
      files: this.files
        .filter((f) => f.tautanId === tautanId)
        .map(({ labelDokumen, namaFile, urutan, status, keteranganHapus }) => ({ labelDokumen, namaFile, urutan, status, keteranganHapus })),
      dilewati: row.dilewati,
    }
  }

  async tandaiSiap({ id, jobId, url }: { id: string; jobId: string; url: string; now: Date }) {
    await this.enter('tandaiSiap', [{ id, jobId, url }])
    const row = this.get(id)
    if (row.revokedAt || row.driveStatus !== 'MENGUNGGAH') return false
    row.driveStatus = 'SIAP'
    row.driveFolderUrl = url
    const files = this.files.filter((f) => f.tautanId === id)
    this.audits.push({
      aksi: 'DRIVE_TAUTAN_SIAP',
      entityId: id,
      metadata: {
        jumlah_file: files.filter((f) => f.status === 'TERUNGGAH').length,
        jumlah_dilewati: files.filter((f) => f.status === 'DILEWATI').length + row.dilewati.length,
      },
    })
    this.jobSelesai.push(jobId)
    return true
  }

  async tandaiGagal(id: string) {
    await this.enter('tandaiGagal', [id])
    const row = this.get(id)
    if (row.revokedAt || !row.driveStatus || !['MENUNGGU', 'MENGUNGGAH'].includes(row.driveStatus)) return false
    row.driveStatus = 'GAGAL'
    return true
  }

  // ---- HapusDriveRepository (section 09) ----

  async ambilBarisMenghapusBerikut(tautanId: string) {
    await this.enter('ambilBarisMenghapusBerikut', [tautanId])
    const row = this.files
      .filter((f) => f.tautanId === tautanId && f.status === 'MENGHAPUS')
      .sort((a, b) => a.kunciLampiran.localeCompare(b.kunciLampiran))[0]
    return row ? { id: row.id, driveFileId: row.driveFileId, keteranganHapus: row.keteranganHapus } : null
  }

  async tandaiBarisDihapus(id: string, now: Date) {
    await this.enter('tandaiBarisDihapus', [id, now])
    const row = this.file(id)
    if (row.status !== 'MENGHAPUS') return false
    Object.assign(row, { status: 'DIHAPUS', dihapusPada: now })
    return true
  }

  async selesaikanHapusTautan({ tautanId, jobId, now }: { tautanId: string; jobId: string; now: Date }) {
    await this.enter('selesaikanHapusTautan', [{ tautanId, jobId }])
    const row = this.get(tautanId)
    if (!row.revokedAt || row.driveStatus === 'DIHAPUS') return false
    const files = this.files.filter((f) => f.tautanId === tautanId && f.status !== 'DIHAPUS')
    const jumlahFile = files.filter((f) => f.driveFileId && (f.status === 'TERUNGGAH' || f.status === 'MENGHAPUS')).length
    for (const f of files) Object.assign(f, { status: 'DIHAPUS', keteranganHapus: f.keteranganHapus ?? 'DICABUT', dihapusPada: now })
    row.driveStatus = 'DIHAPUS'
    this.audits.push({ aksi: 'DRIVE_TAUTAN_DIHAPUS', entityId: tautanId, metadata: { jumlah_file: jumlahFile } })
    this.jobSelesai.push(jobId)
    return true
  }

  async selesaikanHapusFile(input: { tautanId: string; jobId: string; jumlahFile: number; keterangan: LaporanTautanDriveFileKeteranganHapus[]; now: Date }) {
    await this.enter('selesaikanHapusFile', [input])
    if (input.jumlahFile > 0) {
      this.audits.push({
        aksi: 'DRIVE_FILE_DIHAPUS',
        entityId: input.tautanId,
        metadata: { jumlah_file: input.jumlahFile, keterangan: input.keterangan },
      })
    }
    this.jobSelesai.push(input.jobId)
  }
}

/** Akun Drive in-memory (bagian akun-repository yang dipakai handler/runner). */
export class MemoryAkun {
  akun: AkunUntukJob = {
    id: AKUN_ID,
    email: 'admin@example.test',
    status: 'AKTIF',
    refreshTokenEnc: 'v1:enc',
    rootFolderId: null,
    perluHubungUlang: false,
  }
  readonly ditandai: string[] = []

  muatAkunUntukJob = async (akunId: string) => (akunId === this.akun.id ? { ...this.akun } : null)

  perbaruiRootFolder = async (akunId: string, folderId: string) => {
    if (akunId === this.akun.id) this.akun.rootFolderId = folderId
  }

  tandaiPerluHubungUlang = async (akunId: string) => {
    this.ditandai.push(akunId)
    if (akunId === this.akun.id) this.akun.perluHubungUlang = true
    return true
  }
}
