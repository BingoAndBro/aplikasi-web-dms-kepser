/**
 * "Bagikan Tautan" di halaman laporan (Laporan Saya, Laporan Kegiatan,
 * Laporan Kinerja): membuat satu tautan permanen berisi dokumen yang sedang
 * ditampilkan, untuk ditempel ke aplikasi lain yang hanya menerima link.
 * Tiga jenis akses: Terbatas (wajib login), Publik (tanpa akun), dan Google
 * Drive (salinan diunggah ke Drive dan dibagikan lewat link folder Drive).
 * Riwayat Tautan menampilkan tautan yang pernah dibuat pengguna untuk halaman
 * ini: salin ulang / cabut / coba lagi unggahan Drive.
 * Lihat src/lib/laporan/tautan.ts untuk aturan aksesnya.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, History, Link2, Loader2, RotateCcw } from 'lucide-react'

import { useAppToast } from '#/components/ui/AppToast'
import { Button } from '#/components/ui/button'
import { useConfirm } from '#/hooks/useConfirm'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import {
  ACTION_BUTTON_ICON_CLASS,
  COMPACT_ACTION_BUTTON_CLASS,
  DANGER_ACTION_BUTTON_CLASS,
  DIALOG_INPUT_CLASS,
  DIALOG_PRIMARY_BUTTON_CLASS,
  DIALOG_SECONDARY_BUTTON_CLASS,
  TOOLBAR_ACTION_BUTTON_CLASS,
} from '#/components/laporan/actionButtonStyles'
import { ApiError, apiFetch } from '#/lib/api-client'
import { apiMutation } from '#/lib/api-mutation'
import { copyTextToClipboard } from '#/lib/clipboard'
import { GOOGLE_DRIVE_API, TAUTAN_API } from '#/lib/constants/routes'
import {
  DRIVE_ALASAN_TIDAK_TERSEDIA,
  DRIVE_PERINGATAN_PUBLIK,
  type DriveAlasan,
  type GoogleDriveStatusResponse,
} from '#/lib/google-drive/shared'
import {
  TAUTAN_AKSES,
  TAUTAN_AKSES_LABEL,
  TAUTAN_JUDUL_MAX_LENGTH,
  TAUTAN_MAX_DOKUMEN,
  resolveTautanUrl,
  type LaporanTautanAkses,
  type LaporanTautanDriveStatus,
  type LaporanTautanSumber,
  type TautanCreateResponse,
  type TautanListItem,
  type TautanListResponse,
} from '#/lib/laporan/tautan-shared'
import { formatDateTime } from '#/lib/utils/format'

/** Jeda polling progres unggah di dialog Bagikan (SPEC 10.1). */
const DRIVE_POLL_DIALOG_MS = 3000
/** Jeda polling Riwayat Tautan selama ada baris Drive yang berproses (SPEC 10.2). */
const RIWAYAT_POLL_MS = 5000

const DRIVE_STATUS_MENGUNGGAH: readonly LaporanTautanDriveStatus[] = ['MENUNGGU', 'MENGUNGGAH']
const DRIVE_STATUS_BERPROSES: readonly LaporanTautanDriveStatus[] = ['MENUNGGU', 'MENGUNGGAH', 'MENGHAPUS']

const STATUS_DRIVE_GAGAL_DIMUAT = 'Status Google Drive tidak dapat dimuat'

const BADGE_CLASS = 'rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em]'
const AKSES_BADGE_CLASS: Record<LaporanTautanAkses, string> = {
  LOGIN: 'border-zinc-200 bg-zinc-50 text-zinc-600',
  PUBLIK: 'border-amber-200 bg-amber-50 text-amber-800',
  DRIVE: 'border-info-border bg-info-surface text-info-text',
}

function currentOrigin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const payload = error.payload
    if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
      return payload.error
    }
  }
  return error instanceof Error && error.message ? error.message : fallback
}

/** `kode` alasan pada 409 "Google Drive tidak tersedia" saat membuat tautan DRIVE. */
function driveAlasanFromError(err: unknown): DriveAlasan | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null
  const payload = err.payload
  if (payload && typeof payload === 'object' && 'kode' in payload && typeof payload.kode === 'string'
    && Object.hasOwn(DRIVE_ALASAN_TIDAK_TERSEDIA, payload.kode)) {
    return payload.kode as DriveAlasan
  }
  return null
}

function progresText(item: Pick<TautanListItem, 'drive_progres'> | null): string {
  const progres = item?.drive_progres
  return progres ? `${progres.selesai}/${progres.total}` : ''
}

export function BagikanTautanActions({
  sumber,
  dokumenIds,
  manualArsipIds = [],
  defaultJudul,
  keterangan,
}: {
  sumber: LaporanTautanSumber
  dokumenIds: string[]
  manualArsipIds?: string[]
  defaultJudul: string
  keterangan: string
}) {
  const [shareOpen, setShareOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const documentCount = dokumenIds.length + manualArsipIds.length

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={TOOLBAR_ACTION_BUTTON_CLASS}
        disabled={documentCount === 0}
        onClick={() => setShareOpen(true)}
      >
        <Link2 size={15} className={ACTION_BUTTON_ICON_CLASS} />
        Bagikan Tautan
      </Button>
      <Button
        type="button"
        variant="outline"
        className={TOOLBAR_ACTION_BUTTON_CLASS}
        onClick={() => setHistoryOpen(true)}
      >
        <History size={15} className={ACTION_BUTTON_ICON_CLASS} />
        Riwayat Tautan
      </Button>

      <BagikanTautanDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        sumber={sumber}
        dokumenIds={dokumenIds}
        manualArsipIds={manualArsipIds}
        defaultJudul={defaultJudul}
        keterangan={keterangan}
      />
      <RiwayatTautanDialog open={historyOpen} onOpenChange={setHistoryOpen} sumber={sumber} />
    </>
  )
}

type DriveInfo = { tersedia: boolean; alasan: DriveAlasan | null; gagalMuat: boolean }

function BagikanTautanDialog({
  open,
  onOpenChange,
  sumber,
  dokumenIds,
  manualArsipIds,
  defaultJudul,
  keterangan,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sumber: LaporanTautanSumber
  dokumenIds: string[]
  manualArsipIds: string[]
  defaultJudul: string
  keterangan: string
}) {
  const [judul, setJudul] = useState(defaultJudul)
  const [akses, setAkses] = useState<LaporanTautanAkses>(TAUTAN_AKSES.LOGIN)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [driveInfo, setDriveInfo] = useState<DriveInfo | null>(null)
  const [created, setCreated] = useState<{
    id: string
    /** null untuk tautan Google Drive (tidak punya alamat DMS). */
    url: string | null
    akses: LaporanTautanAkses
    jumlahDokumen: number
    jumlahDiabaikan: number
  } | null>(null)
  // Baris Riwayat terbaru untuk tautan DRIVE yang baru dibuat (status + progres unggah).
  const [driveItem, setDriveItem] = useState<TautanListItem | null>(null)
  const [pollTick, setPollTick] = useState(0)
  const documentCount = dokumenIds.length + manualArsipIds.length
  const overLimit = documentCount > TAUTAN_MAX_DOKUMEN

  // Setiap kali dibuka: mulai dari langkah 1 dengan judul sesuai filter terkini.
  // Jenis akses selalu kembali ke Terbatas; Publik/Google Drive harus dipilih lagi dengan sadar.
  useEffect(() => {
    if (!open) return
    setJudul(defaultJudul)
    setAkses(TAUTAN_AKSES.LOGIN)
    setError('')
    setCreated(null)
    setDriveItem(null)
    setPollTick(0)
  }, [open, defaultJudul])

  // Ketersediaan kartu Google Drive dimuat ulang setiap dialog dibuka.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setDriveInfo(null)
    apiFetch<GoogleDriveStatusResponse>(GOOGLE_DRIVE_API.STATUS)
      .then((data) => {
        if (!cancelled) setDriveInfo({ tersedia: data.tersedia, alasan: data.alasan, gagalMuat: false })
      })
      .catch(() => {
        if (!cancelled) setDriveInfo({ tersedia: false, alasan: null, gagalMuat: true })
      })
    return () => { cancelled = true }
  }, [open])

  // Progres unggah: dipoll selama dialog terbuka dan unggahan belum selesai.
  // Menutup dialog menghentikan polling saja; unggahan tetap berjalan di server.
  const createdDriveId = created?.akses === TAUTAN_AKSES.DRIVE ? created.id : null
  const driveMasihMengunggah = driveItem === null || DRIVE_STATUS_MENGUNGGAH.includes(driveItem.drive_status ?? 'MENUNGGU')
  useEffect(() => {
    if (!open || !createdDriveId || !driveMasihMengunggah) return
    let cancelled = false
    // Putaran pertama langsung (memuat total lampiran), berikutnya tiap DRIVE_POLL_DIALOG_MS.
    const timeout = setTimeout(() => {
      apiFetch<TautanListResponse>('/laporan/tautan', { query: { sumber } })
        .then((data) => {
          if (cancelled) return
          const item = data.tautan.find(row => row.id === createdDriveId)
          if (item) setDriveItem(item)
        })
        .catch(() => {
          // Gagal memuat: tampilan terakhir dipertahankan, putaran berikutnya mencoba lagi.
        })
        .finally(() => {
          if (!cancelled) setPollTick(tick => tick + 1)
        })
    }, pollTick === 0 ? 0 : DRIVE_POLL_DIALOG_MS)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [open, createdDriveId, driveMasihMengunggah, pollTick, sumber])

  const driveTersedia = driveInfo?.tersedia === true
  const driveHint = driveInfo === null
    ? 'Memeriksa ketersediaan Google Drive...'
    : driveTersedia
      ? undefined
      : driveInfo.alasan
        ? DRIVE_ALASAN_TIDAK_TERSEDIA[driveInfo.alasan]
        : STATUS_DRIVE_GAGAL_DIMUAT

  async function handleCreate() {
    if (overLimit || documentCount === 0 || !judul.trim()) return
    if (akses === TAUTAN_AKSES.DRIVE && !driveTersedia) return

    setPending(true)
    setError('')
    try {
      const result = await apiMutation<TautanCreateResponse>('/laporan/tautan', {
        body: {
          sumber,
          akses,
          judul: judul.trim(),
          keterangan,
          dokumen_ids: dokumenIds,
          manual_arsip_ids: manualArsipIds,
        },
      })
      setDriveItem(null)
      setPollTick(0)
      setCreated({
        id: result.id,
        url: result.path ? resolveTautanUrl(result.path, result.public_base_url, currentOrigin()) : null,
        akses: result.akses,
        jumlahDokumen: result.jumlah_dokumen,
        jumlahDiabaikan: result.jumlah_diabaikan,
      })
    } catch (err) {
      // 409 + kode: Drive berhenti tersedia sejak dialog dibuka (mis. akun diputus Admin).
      const alasan = driveAlasanFromError(err)
      if (alasan) {
        setDriveInfo({ tersedia: false, alasan, gagalMuat: false })
        setAkses(TAUTAN_AKSES.LOGIN)
      }
      setError(errorMessage(err, 'Gagal membuat tautan'))
    } finally {
      setPending(false)
    }
  }

  const createdIsDrive = created?.akses === TAUTAN_AKSES.DRIVE
  const driveSiap = createdIsDrive && driveItem?.drive_status === 'SIAP' && Boolean(driveItem.drive_url)

  let createdDescription = ''
  if (created) {
    if (createdIsDrive) {
      createdDescription = driveSiap
        ? 'Salin link Google Drive ini ke aplikasi lain. Siapa pun yang memegang link dapat membukanya tanpa login.'
        : 'Dokumen sedang disalin ke Google Drive. Unggahan tetap berjalan bila dialog ditutup; pantau statusnya di Riwayat Tautan.'
    } else {
      createdDescription = created.akses === TAUTAN_AKSES.PUBLIK
        ? 'Salin tautan ini ke aplikasi lain. Siapa pun yang memegang tautan ini dapat membukanya tanpa login.'
        : 'Salin tautan ini ke aplikasi lain. Pembuka tautan wajib login ke aplikasi ini.'
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!pending) onOpenChange(nextOpen)
    }}>
      <DialogContent className="border-brand-border bg-bg-surface shadow-2xl shadow-zinc-950/10 sm:max-w-2xl sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle>
            {created
              ? (createdIsDrive && !driveSiap ? 'Menyalin ke Google Drive' : 'Tautan Siap Dibagikan')
              : 'Bagikan sebagai Tautan'}
          </DialogTitle>
          <DialogDescription>
            {created
              ? createdDescription
              : 'Dokumen yang sedang ditampilkan dikunci ke dalam satu tautan. Tautan berlaku sampai Anda mencabutnya di Riwayat Tautan.'}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-3 px-5 pb-2">
            {created.url && <TautanUrlField url={created.url} />}
            {createdIsDrive && <DriveUnggahStatus item={driveItem} />}
            <p className="text-xs font-semibold text-zinc-600">
              {created.jumlahDokumen} dokumen dimasukkan ke tautan.
              {created.jumlahDiabaikan > 0 && ` ${created.jumlahDiabaikan} dokumen dilewati karena di luar cakupan laporan ini.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3 px-5 pb-2">
            <label className="block space-y-1.5">
              <span className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">Judul Tautan</span>
              <Input
                value={judul}
                maxLength={TAUTAN_JUDUL_MAX_LENGTH}
                onChange={(event) => setJudul(event.target.value)}
                className={`h-10 ${DIALOG_INPUT_CLASS}`}
                disabled={pending}
              />
            </label>
            {keterangan && (
              <p className="rounded-xl border border-brand-border bg-brand-surface/40 px-4 py-2.5 text-xs font-semibold text-zinc-700">
                {keterangan}
              </p>
            )}

            <fieldset className="space-y-1.5" disabled={pending}>
              <legend className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">Siapa yang dapat membuka</legend>
              <div role="radiogroup" aria-label="Jenis akses tautan" className="grid gap-2 sm:grid-cols-3">
                <AksesOption
                  selected={akses === TAUTAN_AKSES.LOGIN}
                  onSelect={() => setAkses(TAUTAN_AKSES.LOGIN)}
                  title="Terbatas"
                  description="Wajib login ke aplikasi ini (role apa pun)."
                />
                <AksesOption
                  selected={akses === TAUTAN_AKSES.PUBLIK}
                  onSelect={() => setAkses(TAUTAN_AKSES.PUBLIK)}
                  title="Publik"
                  description="Siapa saja yang memegang tautan, tanpa akun."
                />
                <AksesOption
                  selected={akses === TAUTAN_AKSES.DRIVE}
                  onSelect={() => setAkses(TAUTAN_AKSES.DRIVE)}
                  title="Google Drive"
                  description="Bisa dibuka dari internet lewat link Google Drive."
                  disabled={!driveTersedia}
                  hint={driveHint}
                />
              </div>
            </fieldset>
            {akses === TAUTAN_AKSES.PUBLIK && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-900">
                Dokumen dalam tautan publik dapat dilihat dan diunduh siapa pun yang mendapat alamatnya,
                tanpa login dan tanpa jejak siapa yang membuka. Bagikan hanya ke pihak yang berhak.
                Anda dapat mencabutnya kapan saja di Riwayat Tautan.
              </p>
            )}
            {akses === TAUTAN_AKSES.DRIVE && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-900">
                {DRIVE_PERINGATAN_PUBLIK}
              </p>
            )}

            {overLimit ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                Filter menghasilkan {documentCount} dokumen. Maksimal {TAUTAN_MAX_DOKUMEN} per tautan — persempit periode atau kegiatan.
              </p>
            ) : (
              <p className="rounded-xl border border-brand-border bg-bg-surface px-4 py-3 text-sm font-semibold text-zinc-700">
                {documentCount} dokumen akan dimasukkan ke tautan.
              </p>
            )}
            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {created ? (
            <Button type="button" className={DIALOG_PRIMARY_BUTTON_CLASS} onClick={() => onOpenChange(false)}>
              {createdIsDrive && !driveSiap ? 'Tutup' : 'Selesai'}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className={DIALOG_SECONDARY_BUTTON_CLASS}
                disabled={pending}
                onClick={() => onOpenChange(false)}
              >
                Batal
              </Button>
              {!overLimit && (
                <Button
                  type="button"
                  className={DIALOG_PRIMARY_BUTTON_CLASS}
                  disabled={pending || documentCount === 0 || !judul.trim() || (akses === TAUTAN_AKSES.DRIVE && !driveTersedia)}
                  onClick={() => { void handleCreate() }}
                >
                  {pending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                  {pending ? 'Membuat Tautan...' : 'Buat Tautan'}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Status unggah tautan DRIVE yang baru dibuat, di dialog Bagikan. */
function DriveUnggahStatus({ item }: { item: TautanListItem | null }) {
  if (item?.drive_tertunda_akun) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
        Tertunda: akun Drive perlu dihubungkan ulang. Unggahan dilanjutkan otomatis setelah Admin menghubungkan ulang akun.
      </p>
    )
  }

  if (item?.drive_status === 'SIAP' && item.drive_url) {
    return (
      <TautanUrlField
        url={item.drive_url}
        copyLabel="Salin link Drive"
        openLabel="Buka di Drive"
        ariaLabel="Link Google Drive"
      />
    )
  }

  if (item?.drive_status === 'GAGAL') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
        <p>{`Gagal: ${item.drive_galat ?? 'unggahan ke Google Drive tidak selesai'}`}</p>
        <p className="mt-1 text-xs font-medium">Lihat Riwayat Tautan untuk mencoba lagi.</p>
      </div>
    )
  }

  const progres = progresText(item)
  return (
    <div className="space-y-1 rounded-xl border border-info-border bg-info-surface px-4 py-3 text-info-text">
      <p className="flex items-center gap-2 text-sm font-semibold" role="status" aria-live="polite">
        <Loader2 size={15} className="shrink-0 animate-spin" />
        {progres ? `Sedang diunggah ke Google Drive (${progres})…` : 'Sedang diunggah ke Google Drive…'}
      </p>
      <p className="text-xs font-medium">Unggahan tetap berjalan bila dialog ditutup.</p>
    </div>
  )
}

function AksesOption({
  selected,
  onSelect,
  title,
  description,
  disabled = false,
  hint,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  description: string
  disabled?: boolean
  /** Alasan kartu nonaktif (mis. Google Drive belum dikonfigurasi). */
  hint?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onSelect}
      className={[
        'rounded-xl border px-3 py-2.5 text-left outline-none transition focus-visible:ring-4 focus-visible:ring-brand-border/60',
        disabled
          ? 'cursor-not-allowed border-zinc-200 bg-zinc-50 opacity-70'
          : selected
            ? 'border-brand-solid bg-brand-surface ring-2 ring-brand-border'
            : 'border-zinc-200 bg-bg-surface hover:border-brand-border-strong hover:bg-brand-surface/60',
      ].join(' ')}
    >
      <span className="block text-sm font-bold text-zinc-950">{title}</span>
      <span className="mt-0.5 block text-xs font-medium text-zinc-600">{description}</span>
      {hint && <span className="mt-1 block text-[11px] font-semibold text-zinc-500">{hint}</span>}
    </button>
  )
}

/** Input URL read-only + Salin + Buka. Bila penyalinan gagal, teks dipilih agar bisa Ctrl+C. */
function TautanUrlField({
  url,
  compact = false,
  copyLabel = 'Salin',
  openLabel = 'Buka',
  ariaLabel = 'Alamat tautan',
}: {
  url: string
  compact?: boolean
  copyLabel?: string
  openLabel?: string
  ariaLabel?: string
}) {
  const { showToast } = useAppToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timeout)
  }, [copied])

  async function handleCopy() {
    const ok = await copyTextToClipboard(url, { container: inputRef.current?.parentElement })
    if (ok) {
      setCopied(true)
      showToast({ title: 'Tersalin', description: 'Tautan disalin ke clipboard.', variant: 'success' })
      return
    }

    inputRef.current?.focus()
    inputRef.current?.select()
    showToast({ title: 'Salin manual', description: 'Tautan sudah dipilih — tekan Ctrl+C untuk menyalin.', variant: 'warning' })
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        ref={inputRef}
        readOnly
        value={url}
        aria-label={ariaLabel}
        onFocus={(event) => event.currentTarget.select()}
        className={`${DIALOG_INPUT_CLASS} min-w-0 flex-1 bg-brand-surface/40 font-mono text-xs ${compact ? 'h-9' : 'h-10'}`}
      />
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          variant="outline"
          className={`${DIALOG_SECONDARY_BUTTON_CLASS} ${compact ? COMPACT_ACTION_BUTTON_CLASS : ''}`}
          onClick={() => { void handleCopy() }}
        >
          {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} className={ACTION_BUTTON_ICON_CLASS} />}
          {copied ? 'Tersalin' : copyLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={`${DIALOG_SECONDARY_BUTTON_CLASS} ${compact ? COMPACT_ACTION_BUTTON_CLASS : ''}`}
          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink size={14} className={ACTION_BUTTON_ICON_CLASS} />
          {openLabel}
        </Button>
      </div>
    </div>
  )
}

/** Teks status Drive per baris Riwayat (SPEC 10.2). Diekspor untuk tes render. */
export function DriveRiwayatStatus({ item }: { item: TautanListItem }) {
  const revoked = item.revoked_at !== null
  const status = item.drive_status

  if (revoked) {
    if (status === 'MENGHAPUS') {
      return (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
          <Loader2 size={13} className="animate-spin" />
          Dicabut · menghapus dari Drive…
        </p>
      )
    }
    if (status === 'DIHAPUS') {
      return <p className="text-xs font-semibold text-zinc-500">Dicabut · terhapus dari Drive</p>
    }
    return null
  }

  if (item.drive_tertunda_akun) {
    return <p className="text-xs font-semibold text-amber-800">Tertunda: akun Drive perlu dihubungkan ulang</p>
  }
  if (status === 'MENUNGGU' || status === 'MENGUNGGAH') {
    const progres = progresText(item)
    return (
      <p className="flex items-center gap-1.5 text-xs font-semibold text-info-text">
        <Loader2 size={13} className="animate-spin" />
        {progres ? `Mengunggah ${progres}` : 'Mengunggah…'}
      </p>
    )
  }
  if (status === 'SIAP') {
    return <p className="text-xs font-semibold text-emerald-700">Google Drive · Siap</p>
  }
  if (status === 'GAGAL') {
    return <p className="text-xs font-semibold text-red-700">{`Gagal: ${item.drive_galat ?? 'unggahan tidak selesai'}`}</p>
  }
  return null
}

function RiwayatTautanDialog({
  open,
  onOpenChange,
  sumber,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sumber: LaporanTautanSumber
}) {
  const confirm = useConfirm()
  const { showToast } = useAppToast()
  const [items, setItems] = useState<TautanListItem[]>([])
  const [publicBaseUrl, setPublicBaseUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  // Respons yang tiba setelah dialog ditutup (atau tersalip permintaan lebih baru) dibuang.
  const openRef = useRef(open)
  const requestSeq = useRef(0)
  openRef.current = open

  /** Muat ulang daftar; dipakai saat dibuka, polling, coba lagi, dan cabut. */
  const reload = useCallback(async ({ silent = true }: { silent?: boolean } = {}) => {
    const seq = ++requestSeq.current
    if (!silent) {
      setLoading(true)
      setError('')
    }
    try {
      const data = await apiFetch<TautanListResponse>('/laporan/tautan', { query: { sumber } })
      if (!openRef.current || seq !== requestSeq.current) return
      setItems(data.tautan)
      setPublicBaseUrl(data.public_base_url)
      setError('')
    } catch (err) {
      if (!openRef.current || seq !== requestSeq.current) return
      // Gagal saat polling: tampilan terakhir dipertahankan; polling berikutnya mencoba lagi.
      if (!silent) setError(errorMessage(err, 'Gagal memuat riwayat tautan'))
      else setItems(current => [...current])
    } finally {
      if (!silent && openRef.current && seq === requestSeq.current) setLoading(false)
    }
  }, [sumber])

  useEffect(() => {
    if (!open) {
      requestSeq.current += 1
      return
    }
    void reload({ silent: false })
  }, [open, reload])

  // Polling selama ada baris Drive yang masih berproses. `items` berganti setiap
  // muat ulang, sehingga efek ini menjadwalkan putaran berikutnya.
  const adaBerproses = items.some(item => (
    item.akses === TAUTAN_AKSES.DRIVE && item.drive_status !== null && DRIVE_STATUS_BERPROSES.includes(item.drive_status)
  ))
  useEffect(() => {
    if (!open || loading || !adaBerproses) return
    const timeout = setTimeout(() => { void reload() }, RIWAYAT_POLL_MS)
    return () => clearTimeout(timeout)
  }, [open, loading, adaBerproses, items, reload])

  async function handleRevoke(item: TautanListItem) {
    const isDrive = item.akses === TAUTAN_AKSES.DRIVE
    const confirmed = await confirm({
      tone: 'destructive',
      title: 'Cabut tautan ini?',
      description: `Tautan "${item.judul}" tidak akan bisa dibuka lagi, termasuk dari aplikasi lain yang sudah menyimpannya.`
        + (isDrive ? ' Salinan di Google Drive akan dihapus permanen.' : '')
        + ' Tindakan ini tidak dapat dibatalkan.',
      confirmLabel: 'Cabut Tautan',
    })
    if (!confirmed) return

    setRevokingId(item.id)
    try {
      await apiMutation(`/laporan/tautan/${encodeURIComponent(item.id)}/revoke`)
      setItems(current => current.map(row => (
        row.id === item.id
          ? { ...row, revoked_at: new Date().toISOString(), drive_url: null, drive_status: isDrive ? 'MENGHAPUS' : row.drive_status }
          : row
      )))
      showToast({
        title: 'Tautan dicabut',
        description: isDrive ? 'Tautan tidak bisa dibuka lagi. Salinan di Google Drive sedang dihapus.' : 'Tautan tidak bisa dibuka lagi.',
        variant: 'success',
      })
      await reload()
    } catch (err) {
      showToast({ title: 'Gagal', description: errorMessage(err, 'Gagal mencabut tautan'), variant: 'error' })
    } finally {
      setRevokingId(null)
    }
  }

  async function handleCobaLagi(item: TautanListItem) {
    setRetryingId(item.id)
    try {
      await apiMutation(TAUTAN_API.cobaLagi(item.id))
      showToast({ title: 'Dijadwalkan ulang', description: 'Unggahan ke Google Drive dicoba lagi.', variant: 'success' })
    } catch (err) {
      // 404: tautan tidak ada / bukan milik pengguna; 409: sudah tidak dalam keadaan gagal.
      showToast({ title: 'Gagal', description: errorMessage(err, 'Gagal menjadwalkan ulang unggahan'), variant: 'error' })
    } finally {
      setRetryingId(null)
    }
    await reload()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-brand-border bg-bg-surface shadow-2xl shadow-zinc-950/10 sm:max-w-2xl sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle>Riwayat Tautan</DialogTitle>
          <DialogDescription>Tautan yang pernah Anda bagikan dari halaman ini.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 pb-5">
          {loading && (
            <div className="flex items-center justify-center py-8 text-sm font-semibold text-zinc-500">
              <Loader2 size={18} className="mr-2 animate-spin" />
              Memuat riwayat tautan...
            </div>
          )}

          {!loading && error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>
          )}

          {!loading && !error && items.length === 0 && (
            <p className="py-8 text-center text-sm font-medium text-zinc-500">Belum ada tautan yang dibagikan dari halaman ini.</p>
          )}

          {!loading && !error && items.map((item) => {
            const revoked = item.revoked_at !== null
            const isDrive = item.akses === TAUTAN_AKSES.DRIVE
            return (
              <div key={item.id} className="space-y-2 rounded-2xl border border-brand-border bg-bg-surface px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-zinc-950">{item.judul}</p>
                    {item.keterangan && (
                      <p className="mt-0.5 line-clamp-2 text-xs font-medium text-zinc-600">{item.keterangan}</p>
                    )}
                    <p className="mt-1 text-[11px] font-medium text-zinc-500">
                      {`Dibuat ${formatDateTime(item.created_at)} · ${item.jumlah_dokumen} dokumen${isDrive ? '' : ` · dibuka ${item.jumlah_akses}×`}`}
                    </p>
                    {isDrive && <div className="mt-1"><DriveRiwayatStatus item={item} /></div>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <span className={`${BADGE_CLASS} ${AKSES_BADGE_CLASS[item.akses]}`}>
                      {TAUTAN_AKSES_LABEL[item.akses]}
                    </span>
                    <span className={revoked
                      ? `${BADGE_CLASS} border-zinc-200 bg-zinc-50 text-zinc-500`
                      : `${BADGE_CLASS} border-emerald-200 bg-emerald-50 text-emerald-700`}
                    >
                      {revoked ? 'Dicabut' : 'Aktif'}
                    </span>
                  </div>
                </div>
                {!revoked && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      {!isDrive && item.path && <TautanUrlField url={resolveTautanUrl(item.path, publicBaseUrl, currentOrigin())} compact />}
                      {isDrive && item.drive_status === 'SIAP' && item.drive_url && (
                        <TautanUrlField
                          url={item.drive_url}
                          compact
                          copyLabel="Salin link Drive"
                          openLabel="Buka di Drive"
                          ariaLabel="Link Google Drive"
                        />
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {isDrive && item.drive_status === 'GAGAL' && (
                        <Button
                          type="button"
                          variant="outline"
                          className={`${DIALOG_SECONDARY_BUTTON_CLASS} ${COMPACT_ACTION_BUTTON_CLASS}`}
                          disabled={retryingId === item.id}
                          onClick={() => { void handleCobaLagi(item) }}
                        >
                          {retryingId === item.id
                            ? <Loader2 size={14} className="animate-spin" />
                            : <RotateCcw size={14} className={ACTION_BUTTON_ICON_CLASS} />}
                          Coba lagi
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className={DANGER_ACTION_BUTTON_CLASS}
                        disabled={revokingId === item.id}
                        onClick={() => { void handleRevoke(item) }}
                      >
                        {revokingId === item.id ? <Loader2 size={14} className="animate-spin" /> : null}
                        Cabut
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
