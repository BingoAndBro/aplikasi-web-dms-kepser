/**
 * Admin → Pengaturan → bagian "Google Drive" (SPEC 10.3): menghubungkan,
 * mengganti, menghubungkan ulang, dan memutus akun Google tujuan tautan
 * laporan, serta menangani salinan yang perlu dihapus manual di Drive.
 *
 * Berbeda dengan tema/identitas, aksi di sini TIDAK memaksa logout. ADMIN
 * tidak melihat daftar dokumen: yang tampil hanya judul tautan, nama folder,
 * dan email akun.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { CloudUpload, ExternalLink, Loader2, RefreshCw, Unplug } from 'lucide-react'

import {
  adminFormLabelClassName,
  adminPrimaryActionClassName,
  adminTextareaClassName,
  AdminConfirmationDialog,
} from '#/components/admin/AdminPagePrimitives'
import { useAppToast } from '#/components/ui/AppToast'
import { Button } from '#/components/ui/button'
import { LoadingState } from '#/components/ui/LoadingState'
import { ApiError, apiFetch } from '#/lib/api-client'
import { apiMutation } from '#/lib/api-mutation'
import { GOOGLE_DRIVE_API } from '#/lib/constants/routes'
import {
  DRIVE_PESAN_GALAT,
  type GoogleDriveAdminResponse,
  type GoogleDriveAkunSummary,
  type MulaiHubungMode,
  type PerluHapusManualItem,
} from '#/lib/google-drive/shared'
import { cn } from '#/lib/utils'

const CARD_CLASS = 'space-y-4 rounded-[18px] border border-border-default bg-white p-5'
const SECONDARY_BUTTON_CLASS = 'h-10 rounded-full border-border-default bg-white px-4 text-sm font-bold text-text-strong hover:bg-slate-50'
const DANGER_BUTTON_CLASS = 'h-10 rounded-full border-danger-border bg-white px-4 text-sm font-bold text-danger-text hover:bg-danger-surface'
const BADGE_CLASS = 'rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em]'

const MODE_JUDUL: Record<MulaiHubungMode, string> = {
  HUBUNGKAN: 'Hubungkan akun Google',
  GANTI: 'Ganti akun',
  HUBUNGKAN_ULANG: 'Hubungkan ulang',
}

type HubungPanel = { mode: MulaiHubungMode; akunId?: string; email?: string }
type PutusTarget = { akun: GoogleDriveAkunSummary; permanen: boolean }

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const payload = error.payload
    if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
      return payload.error
    }
  }
  return error instanceof Error && error.message ? error.message : fallback
}

export function GoogleDriveSettings() {
  const { showToast } = useAppToast()
  const [data, setData] = useState<GoogleDriveAdminResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [panel, setPanel] = useState<HubungPanel | null>(null)
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [alamat, setAlamat] = useState('')
  const [panelError, setPanelError] = useState('')
  const [mulaiPending, setMulaiPending] = useState(false)
  const [simpanPending, setSimpanPending] = useState(false)

  const [putusTarget, setPutusTarget] = useState<PutusTarget | null>(null)
  const [putusPending, setPutusPending] = useState(false)
  const [retryPending, setRetryPending] = useState(false)

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const result = await apiFetch<GoogleDriveAdminResponse>(GOOGLE_DRIVE_API.ADMIN)
      if (mounted.current) setData(result)
    } catch (err) {
      if (mounted.current) setLoadError(errorMessage(err, 'Gagal memuat pengaturan Google Drive'))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function openPanel(next: HubungPanel) {
    setPanel(next)
    setAuthUrl(null)
    setAlamat('')
    setPanelError('')
  }

  function closePanel() {
    if (mulaiPending || simpanPending) return
    setPanel(null)
    setAuthUrl(null)
    setAlamat('')
    setPanelError('')
  }

  // Langkah 1: minta URL login (state + PKCE dibuat server), buka di tab baru.
  async function handleMulai() {
    if (!panel) return
    setMulaiPending(true)
    setPanelError('')
    try {
      const { auth_url } = await apiMutation<{ auth_url: string }>(GOOGLE_DRIVE_API.MULAI_HUBUNG, {
        body: panel.mode === 'HUBUNGKAN_ULANG'
          ? { mode: panel.mode, akun_id: panel.akunId }
          : { mode: panel.mode },
      })
      setAuthUrl(auth_url)
      window.open(auth_url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setPanelError(errorMessage(err, 'Gagal membuka halaman login Google'))
    } finally {
      setMulaiPending(false)
    }
  }

  // Langkah 2: alamat 127.0.0.1 yang gagal dimuat ditempel; server menukar kodenya.
  async function handleSimpan() {
    if (!alamat.trim()) return
    setSimpanPending(true)
    setPanelError('')
    try {
      const result = await apiMutation<{ akun: { email: string } }>(GOOGLE_DRIVE_API.HUBUNGKAN, {
        body: { alamat: alamat.trim() },
      })
      showToast({ title: 'Akun terhubung', description: `Google Drive ${result.akun.email} siap dipakai.`, variant: 'success' })
      setSimpanPending(false)
      setPanel(null)
      setAuthUrl(null)
      setAlamat('')
      await load()
    } catch (err) {
      setPanelError(errorMessage(err, 'Gagal menghubungkan akun Google'))
      setSimpanPending(false)
    }
  }

  async function handlePutuskan() {
    if (!putusTarget) return
    setPutusPending(true)
    try {
      await apiMutation(GOOGLE_DRIVE_API.putuskan(putusTarget.akun.id), { body: { konfirmasi: true } })
      showToast({ title: 'Akun diputus', description: `${putusTarget.akun.email} tidak lagi dipakai aplikasi.`, variant: 'success' })
      setPutusTarget(null)
      await load()
    } catch (err) {
      showToast({ title: 'Gagal', description: errorMessage(err, 'Gagal memutus akun Google Drive'), variant: 'error' })
    } finally {
      setPutusPending(false)
    }
  }

  async function handleCobaLagiPenghapusan() {
    setRetryPending(true)
    try {
      const { jumlah } = await apiMutation<{ jumlah: number }>(GOOGLE_DRIVE_API.COBA_LAGI_PENGHAPUSAN)
      showToast({
        title: jumlah > 0 ? 'Penghapusan dijadwalkan ulang' : 'Tidak ada yang dicoba lagi',
        description: jumlah > 0
          ? `${jumlah} pekerjaan penghapusan dicoba lagi.`
          : 'Penghapusan yang tersisa tidak bisa dicoba lagi (mis. akunnya sudah diputus).',
        variant: jumlah > 0 ? 'success' : 'warning',
      })
      await load()
    } catch (err) {
      showToast({ title: 'Gagal', description: errorMessage(err, 'Gagal mencoba lagi penghapusan'), variant: 'error' })
    } finally {
      setRetryPending(false)
    }
  }

  return (
    <section className={CARD_CLASS} aria-labelledby="google-drive-settings-title">
      <div className="flex items-center gap-2">
        <CloudUpload size={16} className="text-brand-icon" />
        <h2 id="google-drive-settings-title" className="text-sm font-extrabold text-text-strong">Google Drive</h2>
      </div>
      <p className="text-xs font-medium text-text-muted">
        Akun Google tujuan tautan laporan "Google Drive". Perubahan di bagian ini tidak membuat Anda keluar dari aplikasi.
      </p>

      {loading && !data ? (
        <LoadingState variant="list" label="Memuat pengaturan Google Drive" />
      ) : loadError && !data ? (
        <div className="space-y-3 rounded-[14px] border border-danger-border bg-danger-surface px-4 py-3">
          <p className="text-sm font-semibold text-danger-text">{loadError}</p>
          <Button type="button" variant="outline" className={SECONDARY_BUTTON_CLASS} onClick={() => { void load() }}>
            <RefreshCw size={14} />
            Muat ulang
          </Button>
        </div>
      ) : data && !data.dikonfigurasi ? (
        <div className="space-y-2 rounded-[14px] border border-info-border bg-info-surface px-4 py-3 text-info-text">
          <p className="text-sm font-semibold">Fitur Google Drive belum dikonfigurasi.</p>
          <p className="text-xs font-medium">
            Isi variabel <code className="font-mono">GOOGLE_OAUTH_CLIENT_ID</code>, <code className="font-mono">GOOGLE_OAUTH_CLIENT_SECRET</code>,
            {' '}dan <code className="font-mono">DMS_DRIVE_TOKEN_KEY</code> di berkas env server, lalu jalankan ulang aplikasi.
          </p>
        </div>
      ) : data ? (
        <div className="space-y-4">
          {loadError && (
            <p className="rounded-[14px] border border-danger-border bg-danger-surface px-4 py-2.5 text-xs font-semibold text-danger-text">{loadError}</p>
          )}

          {data.akun_aktif ? (
            <AkunAktifRow
              akun={data.akun_aktif}
              disabled={panel !== null}
              onGanti={() => openPanel({ mode: 'GANTI' })}
              onHubungkanUlang={(akun) => openPanel({ mode: 'HUBUNGKAN_ULANG', akunId: akun.id, email: akun.email })}
              onPutuskan={(akun) => setPutusTarget({ akun, permanen: false })}
            />
          ) : (
            <div className="flex flex-col gap-3 rounded-[14px] border border-border-default px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-text-body">Belum ada akun Google Drive terhubung.</p>
              <Button
                type="button"
                className={adminPrimaryActionClassName}
                disabled={panel !== null}
                onClick={() => openPanel({ mode: 'HUBUNGKAN' })}
              >
                Hubungkan akun Google
              </Button>
            </div>
          )}

          {panel && (
            <div className="space-y-4 rounded-[14px] border border-brand-border bg-brand-surface/40 px-4 py-4">
              <p className="text-sm font-extrabold text-text-strong">
                {MODE_JUDUL[panel.mode]}{panel.email ? ` — ${panel.email}` : ''}
              </p>

              <div className="space-y-2">
                <p className={adminFormLabelClassName}>Langkah 1</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    className={SECONDARY_BUTTON_CLASS}
                    disabled={mulaiPending || simpanPending}
                    onClick={() => { void handleMulai() }}
                  >
                    {mulaiPending ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                    Buka halaman login Google
                  </Button>
                  {authUrl && (
                    <a
                      href={authUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-brand-text underline underline-offset-2"
                    >
                      Tab tidak terbuka? Klik di sini.
                    </a>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="google-drive-alamat" className={adminFormLabelClassName}>
                  Langkah 2 · Tempel alamat dari tab yang gagal dimuat
                </label>
                <textarea
                  id="google-drive-alamat"
                  value={alamat}
                  onChange={(event) => setAlamat(event.target.value)}
                  maxLength={2048}
                  rows={3}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="http://127.0.0.1:53682/?state=...&code=..."
                  className={cn(adminTextareaClassName, 'font-mono text-xs')}
                  disabled={simpanPending}
                />
                <p className="text-[11px] font-medium text-text-muted">
                  Setelah klik Izinkan, tab Google akan menampilkan halaman gagal dimuat (alamat diawali http://127.0.0.1:53682).
                  Itu normal — salin seluruh alamatnya ke sini.
                </p>
              </div>

              {panelError && (
                <p className="rounded-[14px] border border-danger-border bg-danger-surface px-4 py-2.5 text-sm font-semibold text-danger-text">
                  {panelError}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={SECONDARY_BUTTON_CLASS}
                  disabled={mulaiPending || simpanPending}
                  onClick={closePanel}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  className={adminPrimaryActionClassName}
                  disabled={!alamat.trim() || simpanPending || mulaiPending}
                  onClick={() => { void handleSimpan() }}
                >
                  {simpanPending && <Loader2 size={14} className="animate-spin" />}
                  Simpan
                </Button>
              </div>
            </div>
          )}

          {data.akun_lain.length > 0 && (
            <div className="space-y-2">
              <p className={adminFormLabelClassName}>Akun tidak aktif</p>
              {data.akun_lain.map((akun) => (
                <div
                  key={akun.id}
                  className="flex flex-col gap-3 rounded-[14px] border border-border-default px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-text-strong">{akun.email}</p>
                    <p className="text-xs font-medium text-text-muted">
                      {`${akun.jumlah_tautan_aktif} tautan Drive aktif · ${akun.jumlah_job_gagal} pekerjaan gagal`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className={DANGER_BUTTON_CLASS}
                    onClick={() => setPutusTarget({ akun, permanen: true })}
                  >
                    <Unplug size={14} />
                    Putuskan permanen
                  </Button>
                </div>
              ))}
            </div>
          )}

          <PerluHapusManual
            items={data.perlu_hapus_manual}
            retryPending={retryPending}
            onRetry={() => { void handleCobaLagiPenghapusan() }}
          />
        </div>
      ) : null}

      <AdminConfirmationDialog
        open={putusTarget !== null}
        onOpenChange={(open) => { if (!open && !putusPending) setPutusTarget(null) }}
        title={putusTarget?.permanen ? 'Putuskan permanen akun ini?' : 'Putuskan akun Google Drive?'}
        tone="destructive"
        icon={<Unplug size={18} />}
        confirmLabel={putusPending ? 'Memutus...' : (putusTarget?.permanen ? 'Putuskan permanen' : 'Putuskan')}
        cancelLabel="Batal"
        loading={putusPending}
        onCancel={() => { if (!putusPending) setPutusTarget(null) }}
        onConfirm={() => { void handlePutuskan() }}
      >
        {putusTarget && (
          <>
            Akun <strong className="text-text-strong">{putusTarget.akun.email}</strong> memiliki
            {' '}<strong className="text-text-strong">{putusTarget.akun.jumlah_tautan_aktif} tautan Google Drive aktif</strong>.
            {' '}Setelah diputus, aplikasi tidak bisa lagi mengunggah atau menghapus salinan di akun ini; folder tautan yang
            {' '}masih ada harus dihapus manual di Google Drive.
            {!putusTarget.permanen && ' Tautan baru tujuan Google Drive tidak bisa dibuat sampai akun lain dihubungkan.'}
            {' '}Tindakan ini tidak dapat dibatalkan.
          </>
        )}
      </AdminConfirmationDialog>
    </section>
  )
}

function AkunAktifRow({
  akun,
  disabled,
  onGanti,
  onHubungkanUlang,
  onPutuskan,
}: {
  akun: GoogleDriveAkunSummary
  disabled: boolean
  onGanti: () => void
  onHubungkanUlang: (akun: GoogleDriveAkunSummary) => void
  onPutuskan: (akun: GoogleDriveAkunSummary) => void
}) {
  return (
    <div className="space-y-3 rounded-[14px] border border-border-default px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 truncate text-sm font-bold text-text-strong">{akun.email}</p>
        <span className={akun.perlu_hubung_ulang
          ? `${BADGE_CLASS} border-warning-border bg-warning-surface text-warning-text`
          : `${BADGE_CLASS} border-success-border bg-success-surface text-success-text`}
        >
          {akun.perlu_hubung_ulang ? 'Perlu dihubungkan ulang' : 'Terhubung'}
        </span>
      </div>
      <p className="text-xs font-medium text-text-muted">
        {`${akun.jumlah_tautan_aktif} tautan Drive aktif · ${akun.jumlah_job_gagal} pekerjaan gagal`}
      </p>
      <div className="flex flex-wrap gap-2">
        {akun.perlu_hubung_ulang && (
          <Button
            type="button"
            className={adminPrimaryActionClassName}
            disabled={disabled}
            onClick={() => onHubungkanUlang(akun)}
          >
            Hubungkan ulang
          </Button>
        )}
        <Button type="button" variant="outline" className={SECONDARY_BUTTON_CLASS} disabled={disabled} onClick={onGanti}>
          Ganti akun
        </Button>
        <Button type="button" variant="outline" className={DANGER_BUTTON_CLASS} disabled={disabled} onClick={() => onPutuskan(akun)}>
          <Unplug size={14} />
          Putuskan
        </Button>
      </div>
    </div>
  )
}

function PerluHapusManual({
  items,
  retryPending,
  onRetry,
}: {
  items: PerluHapusManualItem[]
  retryPending: boolean
  onRetry: () => void
}) {
  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className={adminFormLabelClassName}>Perlu dihapus manual di Drive</p>
        <Button type="button" variant="outline" className={SECONDARY_BUTTON_CLASS} disabled={retryPending} onClick={onRetry}>
          {retryPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Coba lagi penghapusan yang gagal
        </Button>
      </div>
      <p className="text-[11px] font-medium text-text-muted">
        Penghapusan salinan di bawah ini gagal. Selama belum terhapus, link Google Drive-nya masih bisa dibuka.
        Hapus foldernya sendiri di Google Drive akun yang disebut, atau coba lagi.
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.job_id} className="rounded-[14px] border border-warning-border bg-warning-surface px-4 py-3 text-warning-text">
            <p className="text-sm font-bold">{item.judul_tautan}</p>
            <p className="mt-0.5 text-xs font-medium">
              {`Folder "${item.nama_folder}" · ${item.email_akun}`}
            </p>
            <p className="mt-0.5 text-xs font-medium">
              {item.jumlah_file === null ? 'Seluruh folder' : `${item.jumlah_file} file di folder`}
              {' · '}
              {item.kategori ? DRIVE_PESAN_GALAT[item.kategori] : 'Penyebab tidak diketahui'}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
