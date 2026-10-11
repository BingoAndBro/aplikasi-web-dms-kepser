/**
 * "Bagikan Tautan" di halaman laporan (Laporan Saya, Laporan Kegiatan,
 * Laporan Kinerja): membuat satu tautan permanen berisi dokumen yang sedang
 * ditampilkan, untuk ditempel ke aplikasi lain yang hanya menerima link.
 * Pembuka tautan wajib login (role apa pun). Riwayat Tautan menampilkan
 * tautan yang pernah dibuat pengguna untuk halaman ini: salin ulang / cabut.
 * Lihat src/lib/laporan/tautan.ts untuk aturan aksesnya.
 */
import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, History, Link2, Loader2 } from 'lucide-react'

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
import {
  TAUTAN_AKSES,
  TAUTAN_AKSES_LABEL,
  TAUTAN_JUDUL_MAX_LENGTH,
  TAUTAN_MAX_DOKUMEN,
  resolveTautanUrl,
  type LaporanTautanAkses,
  type LaporanTautanSumber,
  type TautanCreateResponse,
  type TautanListItem,
  type TautanListResponse,
} from '#/lib/laporan/tautan-shared'
import { formatDateTime } from '#/lib/utils/format'

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
  const [created, setCreated] = useState<{
    url: string
    akses: LaporanTautanAkses
    jumlahDokumen: number
    jumlahDiabaikan: number
  } | null>(null)
  const documentCount = dokumenIds.length + manualArsipIds.length
  const overLimit = documentCount > TAUTAN_MAX_DOKUMEN

  // Setiap kali dibuka: mulai dari langkah 1 dengan judul sesuai filter terkini.
  // Jenis akses selalu kembali ke Terbatas; Publik harus dipilih lagi dengan sadar.
  useEffect(() => {
    if (!open) return
    setJudul(defaultJudul)
    setAkses(TAUTAN_AKSES.LOGIN)
    setError('')
    setCreated(null)
  }, [open, defaultJudul])

  async function handleCreate() {
    if (overLimit || documentCount === 0 || !judul.trim()) return

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
      setCreated({
        url: resolveTautanUrl(result.path, result.public_base_url, currentOrigin()),
        akses: result.akses,
        jumlahDokumen: result.jumlah_dokumen,
        jumlahDiabaikan: result.jumlah_diabaikan,
      })
    } catch (err) {
      setError(errorMessage(err, 'Gagal membuat tautan'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!pending) onOpenChange(nextOpen)
    }}>
      <DialogContent className="border-brand-border bg-bg-surface shadow-2xl shadow-zinc-950/10 sm:max-w-lg sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle>{created ? 'Tautan Siap Dibagikan' : 'Bagikan sebagai Tautan'}</DialogTitle>
          <DialogDescription>
            {created
              ? (created.akses === TAUTAN_AKSES.PUBLIK
                ? 'Salin tautan ini ke aplikasi lain. Siapa pun yang memegang tautan ini dapat membukanya tanpa login.'
                : 'Salin tautan ini ke aplikasi lain. Pembuka tautan wajib login ke aplikasi ini.')
              : 'Dokumen yang sedang ditampilkan dikunci ke dalam satu tautan. Tautan berlaku sampai Anda mencabutnya di Riwayat Tautan.'}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-3 px-5 pb-2">
            <TautanUrlField url={created.url} />
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
              <div role="radiogroup" aria-label="Jenis akses tautan" className="grid gap-2 sm:grid-cols-2">
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
              </div>
            </fieldset>
            {akses === TAUTAN_AKSES.PUBLIK && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-900">
                Dokumen dalam tautan publik dapat dilihat dan diunduh siapa pun yang mendapat alamatnya,
                tanpa login dan tanpa jejak siapa yang membuka. Bagikan hanya ke pihak yang berhak.
                Anda dapat mencabutnya kapan saja di Riwayat Tautan.
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
              Selesai
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
                  disabled={pending || documentCount === 0 || !judul.trim()}
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

function AksesOption({
  selected,
  onSelect,
  title,
  description,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={[
        'rounded-xl border px-3 py-2.5 text-left outline-none transition focus-visible:ring-4 focus-visible:ring-brand-border/60',
        selected
          ? 'border-brand-solid bg-brand-surface ring-2 ring-brand-border'
          : 'border-zinc-200 bg-bg-surface hover:border-brand-border-strong hover:bg-brand-surface/60',
      ].join(' ')}
    >
      <span className="block text-sm font-bold text-zinc-950">{title}</span>
      <span className="mt-0.5 block text-xs font-medium text-zinc-600">{description}</span>
    </button>
  )
}

/** Input URL read-only + Salin + Buka. Bila penyalinan gagal, teks dipilih agar bisa Ctrl+C. */
function TautanUrlField({ url, compact = false }: { url: string; compact?: boolean }) {
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
        aria-label="Alamat tautan"
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
          {copied ? 'Tersalin' : 'Salin'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={`${DIALOG_SECONDARY_BUTTON_CLASS} ${compact ? COMPACT_ACTION_BUTTON_CLASS : ''}`}
          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink size={14} className={ACTION_BUTTON_ICON_CLASS} />
          Buka
        </Button>
      </div>
    </div>
  )
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

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError('')

    apiFetch<TautanListResponse>('/laporan/tautan', { query: { sumber } })
      .then((data) => {
        if (cancelled) return
        setItems(data.tautan)
        setPublicBaseUrl(data.public_base_url)
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, 'Gagal memuat riwayat tautan'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [open, sumber])

  async function handleRevoke(item: TautanListItem) {
    const confirmed = await confirm({
      tone: 'destructive',
      title: 'Cabut tautan ini?',
      description: `Tautan "${item.judul}" tidak akan bisa dibuka lagi, termasuk dari aplikasi lain yang sudah menyimpannya. Tindakan ini tidak dapat dibatalkan.`,
      confirmLabel: 'Cabut Tautan',
    })
    if (!confirmed) return

    setRevokingId(item.id)
    try {
      await apiMutation(`/laporan/tautan/${encodeURIComponent(item.id)}/revoke`)
      setItems(current => current.map(row => (
        row.id === item.id ? { ...row, revoked_at: new Date().toISOString() } : row
      )))
      showToast({ title: 'Tautan dicabut', description: 'Tautan tidak bisa dibuka lagi.', variant: 'success' })
    } catch (err) {
      showToast({ title: 'Gagal', description: errorMessage(err, 'Gagal mencabut tautan'), variant: 'error' })
    } finally {
      setRevokingId(null)
    }
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
            return (
              <div key={item.id} className="space-y-2 rounded-2xl border border-brand-border bg-bg-surface px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-zinc-950">{item.judul}</p>
                    {item.keterangan && (
                      <p className="mt-0.5 line-clamp-2 text-xs font-medium text-zinc-600">{item.keterangan}</p>
                    )}
                    <p className="mt-1 text-[11px] font-medium text-zinc-500">
                      {`Dibuat ${formatDateTime(item.created_at)} · ${item.jumlah_dokumen} dokumen · dibuka ${item.jumlah_akses}×`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <span className={item.akses === TAUTAN_AKSES.PUBLIK
                      ? 'rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-amber-800'
                      : 'rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-zinc-600'}
                    >
                      {TAUTAN_AKSES_LABEL[item.akses]}
                    </span>
                    <span className={revoked
                      ? 'rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-zinc-500'
                      : 'rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-emerald-700'}
                    >
                      {revoked ? 'Dicabut' : 'Aktif'}
                    </span>
                  </div>
                </div>
                {!revoked && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <TautanUrlField url={resolveTautanUrl(item.path, publicBaseUrl, currentOrigin())} compact />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className={`shrink-0 ${DANGER_ACTION_BUTTON_CLASS}`}
                      disabled={revokingId === item.id}
                      onClick={() => { void handleRevoke(item) }}
                    >
                      {revokingId === item.id ? <Loader2 size={14} className="animate-spin" /> : null}
                      Cabut
                    </Button>
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
