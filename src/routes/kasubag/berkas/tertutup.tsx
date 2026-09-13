import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { AlertTriangle, ChevronRight, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  ARCHIVE_PAGE_CONTAINER_CLASS,
  ARCHIVE_TABLE_HEAD_CLASS,
  ARCHIVE_TABLE_ROW_CLASS,
  ArchiveExportButton,
  ArchiveMobileCard,
  ArchiveMobileList,
  ArchiveSearchPanel,
  ArchiveTableShell,
} from '#/components/archive/ArchivePagePrimitives'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { ConfirmDialog } from '#/components/ui/ConfirmDialog'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { StatusBadge } from '#/components/ui/StatusBadge'
import { useAppToast } from '#/components/ui/AppToast'
import {
  formatBerkasArchiveStatusLabel,
  formatKlasifikasiLabel,
  formatNominalRupiah,
  formatNullableDateLabel,
} from '#/lib/archive/berkas-arsip-page-format'
import {
  BERKAS_TERTUTUP_LIST_CSV_FILENAME,
  createBerkasFolderListCsv,
  downloadCsvFile,
} from '#/lib/archive/berkas-arsip-csv'
import { ApiError, apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/arsiparis/berkas/tertutup')({ component: BerkasTertutupPage })

type BerkasFolder = {
  berkas_id: string
  klasifikasi_id: string
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string
  status_berkas: string
  status_arsip: string | null
  nomor_spm: string | null
  retensi_aktif: string | null
  masa_aktif_berakhir: string | null
  umur_berkas: number | null
  jatuh_tempo: boolean
  tanggal_jatuh_tempo: string | null
  closed_at: string | null
  item_count: number
  workflow_item_count: number
  manual_item_count: number
  total_nominal_realisasi: number | null
  created_at: string | null
  updated_at: string | null
}

type BerkasFolderListResponse = {
  berkas?: BerkasFolder[]
  error?: string
}

const LOCAL_NO_MATCH_MESSAGE = 'Tidak ada data yang cocok dengan pencarian.'

function BerkasTertutupPage() {
  const navigate = useNavigate()
  const { showToast } = useAppToast()
  const [folders, setFolders] = useState<BerkasFolder[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingBerkasId, setPendingBerkasId] = useState<string | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchRunning, setBatchRunning] = useState(false)

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      // Server mengurutkan closed_at ASC (terlama dulu) untuk daftar CLOSED.
      const json = await apiFetch<BerkasFolderListResponse>('/arsiparis/berkas', {
        query: {
          status_berkas: 'CLOSED',
          status_arsip: 'AKTIF',
        },
      })
      setFolders(json.berkas ?? [])
    } catch (error) {
      setError(resolveErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filteredFolders = filterBerkasFolders(folders, searchQuery)
  const hasSearchQuery = searchQuery.trim().length > 0
  const canExport = filteredFolders.length > 0 && !loading && !error
  const dueFolders = folders.filter((folder) => folder.jatuh_tempo)
  const canBatchPropose = dueFolders.length > 0 && !loading && !error && !batchRunning

  function exportCsv() {
    const csv = createBerkasFolderListCsv([{ label: 'Berkas Tertutup', folders: filteredFolders }])
    downloadCsvFile(BERKAS_TERTUTUP_LIST_CSV_FILENAME, csv)
  }

  async function proposeDestruction(folder: BerkasFolder) {
    setPendingBerkasId(folder.berkas_id)
    try {
      await apiFetch(`/arsiparis/berkas/${encodeURIComponent(folder.berkas_id)}/lifecycle`, {
        method: 'POST',
        body: JSON.stringify({ action: 'propose_destruction' }),
      })
      showToast({ title: 'Berhasil', description: 'Berkas masuk daftar Usul Pembersihan.', variant: 'success' })
      await fetchData()
    } catch (error) {
      showToast({ title: 'Gagal', description: resolveErrorMessage(error), variant: 'error' })
    } finally {
      setPendingBerkasId(null)
    }
  }

  async function runBatchPropose() {
    setBatchOpen(false)
    setBatchRunning(true)
    const ids = dueFolders.map((folder) => folder.berkas_id)
    const results = await mapWithConcurrency(ids, 4, (id) =>
      apiFetch(`/arsiparis/berkas/${encodeURIComponent(id)}/lifecycle`, {
        method: 'POST',
        body: JSON.stringify({ action: 'propose_destruction' }),
      })
        .then(() => ({ ok: true }))
        .catch(() => ({ ok: false })),
    )
    const okCount = results.filter((result) => result.ok).length
    const failCount = results.length - okCount
    showToast({
      title: failCount === 0 ? 'Berhasil' : 'Sebagian berhasil',
      description: `${okCount} berkas berhasil diusulkan${failCount ? `, ${failCount} gagal` : ''}.`,
      variant: failCount === 0 ? 'success' : 'warning',
    })
    setBatchRunning(false)
    await fetchData()
  }

  return (
    <PageLayout>
      <div className={ARCHIVE_PAGE_CONTAINER_CLASS}>
        <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[30px]">
              Berkas Tertutup
            </h1>
            <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-zinc-700">
              Berkas Tersimpan yang sudah ditutup. Urut dari yang paling lama ditutup. Usulkan pembersihan saat berkas jatuh tempo.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                className="h-9 gap-1.5 rounded-xl bg-[#FF5A00] text-xs font-bold text-white hover:bg-[#EA580C]"
                disabled={!canBatchPropose}
                onClick={() => setBatchOpen(true)}
                title={dueFolders.length > 0 ? 'Usulkan semua berkas yang jatuh tempo' : 'Tidak ada berkas jatuh tempo'}
              >
                {batchRunning ? <Loader2 size={13} className="animate-spin" /> : <AlertTriangle size={13} />}
                Usulkan Semua yang Jatuh Tempo
              </Button>
              <ArchiveExportButton
                disabled={!canExport}
                title={canExport ? 'Ekspor CSV' : 'Tidak ada data untuk diekspor'}
                onClick={exportCsv}
              />
            </div>
            {!canExport && !loading && !error && (
              <p className="text-xs text-on-surface-variant">Tidak ada data untuk diekspor.</p>
            )}
          </div>
        </section>

        <ArchiveSearchPanel
          id="berkas-tertutup-page-local-search"
          label="Pencarian lokal halaman"
          value={searchQuery}
          placeholder="Cari Cara Pembayaran atau Nomor SPM..."
          resultText={`${filteredFolders.length} dari ${folders.length} berkas ditampilkan`}
          onChange={setSearchQuery}
        />

        {loading ? (
          <LoadingState variant="list" label="Memuat berkas tertutup" />
        ) : error ? (
          <ErrorState
            title="Gagal memuat berkas tertutup"
            description={error}
            action={<Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>}
            variant="page"
          />
        ) : filteredFolders.length === 0 ? (
          <EmptyState
            title={hasSearchQuery ? LOCAL_NO_MATCH_MESSAGE : 'Belum ada berkas tertutup'}
            description={hasSearchQuery
              ? 'Ubah kata kunci untuk melihat berkas lain di halaman ini.'
              : 'Berkas tertutup muncul setelah berkas terbuka ditutup dan disimpan sebagai arsip.'}
            icon={<ChevronRight size={22} />}
          />
        ) : (
          <BerkasTertutupTable
            folders={filteredFolders}
            pendingBerkasId={pendingBerkasId}
            onOpen={(folder) => navigate({ to: '/arsiparis/berkas/$id', params: { id: folder.berkas_id } })}
            onProposeDestruction={proposeDestruction}
          />
        )}
      </div>

      <ConfirmDialog
        open={batchOpen}
        onOpenChange={(open) => { if (!batchRunning) setBatchOpen(open) }}
        tone="warning"
        title="Usulkan Semua yang Jatuh Tempo?"
        description={`${dueFolders.length} berkas jatuh tempo akan diusulkan untuk pembersihan. Kegagalan sebagian tidak membatalkan yang berhasil.`}
        confirmLabel="Usulkan Semua"
        pending={batchRunning}
        onConfirm={runBatchPropose}
      />
    </PageLayout>
  )
}

function BerkasTertutupTable({
  folders,
  pendingBerkasId,
  onOpen,
  onProposeDestruction,
}: {
  folders: BerkasFolder[]
  pendingBerkasId: string | null
  onOpen: (folder: BerkasFolder) => void
  onProposeDestruction: (folder: BerkasFolder) => void
}) {
  return (
    <>
      <ArchiveTableShell>
        <table className="w-full text-left">
          <thead>
            <tr className="border-neutral-200 bg-neutral-100 hover:bg-neutral-100">
              <th className={ARCHIVE_TABLE_HEAD_CLASS}>Cara Pembayaran</th>
              <th className={ARCHIVE_TABLE_HEAD_CLASS}>Nomor SPM</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Jumlah Dokumen</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Nominal Realisasi</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Tgl Tutup</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Umur Berkas</th>
              <th className={`w-52 text-right ${ARCHIVE_TABLE_HEAD_CLASS}`}>Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 text-[13px]">
            {folders.map((folder) => (
              <tr
                key={folder.berkas_id}
                className={`${ARCHIVE_TABLE_ROW_CLASS} cursor-pointer`}
                onClick={() => onOpen(folder)}
              >
                <td className="max-w-[420px] px-6 py-5 text-zinc-950">
                  <p className="line-clamp-2 text-[15px] font-semibold tracking-tight transition-colors group-hover:text-[#FF4D00]">
                    {formatKlasifikasiLabel(folder.klasifikasi_kode_snapshot, folder.klasifikasi_nama_snapshot)}
                  </p>
                </td>
                <td className="px-6 py-5 text-sm font-semibold text-zinc-900">{folder.nomor_spm ?? '-'}</td>
                <td className="px-6 py-5 text-center text-sm font-semibold text-zinc-900">{folder.item_count}</td>
                <td className="px-6 py-5 text-center font-mono text-sm font-bold text-zinc-950">{formatNominalRupiah(folder.total_nominal_realisasi)}</td>
                <td className="px-6 py-5 text-center text-sm font-semibold text-zinc-500">{formatNullableDateLabel(folder.closed_at)}</td>
                <td className="px-6 py-5 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-sm font-semibold text-zinc-700">{formatUmurBerkas(folder.umur_berkas)}</span>
                    {folder.jatuh_tempo && <JatuhTempoBadge />}
                  </div>
                </td>
                <td className="px-6 py-5 text-right" onClick={(event) => event.stopPropagation()}>
                  <UsulkanPembersihanButton
                    folder={folder}
                    pending={pendingBerkasId === folder.berkas_id}
                    onConfirm={() => onProposeDestruction(folder)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ArchiveTableShell>
      <ArchiveMobileList>
        {folders.map((folder) => (
          <ArchiveMobileCard
            key={folder.berkas_id}
            title={formatKlasifikasiLabel(folder.klasifikasi_kode_snapshot, folder.klasifikasi_nama_snapshot)}
            subtitle={`Nomor SPM: ${folder.nomor_spm ?? '-'}`}
            status={<StatusArsipBadge statusArsip={folder.status_arsip} statusBerkas={folder.status_berkas} />}
            meta={[
              { label: 'Jumlah dokumen', value: folder.item_count },
              { label: 'Umur berkas', value: formatUmurBerkas(folder.umur_berkas) },
              { label: 'Jatuh tempo', value: folder.jatuh_tempo ? 'Ya' : 'Belum' },
              {
                label: 'Total nominal',
                value: <span className="font-mono font-bold text-zinc-950">{formatNominalRupiah(folder.total_nominal_realisasi)}</span>,
              },
              { label: 'Tanggal tutup', value: formatNullableDateLabel(folder.closed_at) },
            ]}
            action={
              <UsulkanPembersihanButton
                folder={folder}
                pending={pendingBerkasId === folder.berkas_id}
                onConfirm={() => onProposeDestruction(folder)}
                fullWidth
              />
            }
          />
        ))}
      </ArchiveMobileList>
    </>
  )
}

function UsulkanPembersihanButton({
  folder,
  pending,
  onConfirm,
  fullWidth = false,
}: {
  folder: BerkasFolder
  pending: boolean
  onConfirm: () => void
  fullWidth?: boolean
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        size="sm"
        className={`h-9 gap-1.5 rounded-xl bg-[#FF5A00] text-xs font-bold text-white hover:bg-[#EA580C] ${fullWidth ? 'w-full' : ''}`}
        disabled={pending}
        onClick={() => setConfirmOpen(true)}
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <ChevronRight size={13} />}
        Usulkan Pembersihan
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => { if (!pending) setConfirmOpen(open) }}
        tone="warning"
        title="Usulkan Pembersihan?"
        description={
          <>
            Berkas <span className="font-semibold text-zinc-950">{formatKlasifikasiLabel(folder.klasifikasi_kode_snapshot, folder.klasifikasi_nama_snapshot)}</span>
            {folder.nomor_spm ? ` (Nomor SPM: ${folder.nomor_spm})` : ''} akan masuk daftar Usul Pembersihan. Tidak ada file yang dihapus pada tahap ini; usulan masih dapat dibatalkan.
          </>
        }
        confirmLabel="Usulkan Pembersihan"
        pending={pending}
        onConfirm={() => { setConfirmOpen(false); onConfirm() }}
      />
    </>
  )
}

function JatuhTempoBadge() {
  return (
    <span className="inline-flex w-fit items-center rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-red-700">
      Jatuh Tempo
    </span>
  )
}

function StatusArsipBadge({ statusArsip, statusBerkas }: { statusArsip: string | null; statusBerkas: string }) {
  return (
    <StatusBadge
      kind="archive"
      status={statusArsip}
      fallbackLabel={formatBerkasArchiveStatusLabel(statusArsip, statusBerkas)}
    />
  )
}

function formatUmurBerkas(value: number | null): string {
  return value === null ? '-' : `${value} hari`
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  async function runNext(): Promise<void> {
    const index = cursor++
    if (index >= items.length) return
    results[index] = await worker(items[index])
    await runNext()
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => runNext())
  await Promise.all(runners)
  return results
}

function filterBerkasFolders(folders: BerkasFolder[], query: string): BerkasFolder[] {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) return folders

  return folders.filter((folder) => buildBerkasFolderSearchText(folder).includes(normalizedQuery))
}

function buildBerkasFolderSearchText(folder: BerkasFolder): string {
  return [
    folder.klasifikasi_kode_snapshot,
    folder.klasifikasi_nama_snapshot,
    formatKlasifikasiLabel(folder.klasifikasi_kode_snapshot, folder.klasifikasi_nama_snapshot),
    folder.nomor_spm,
    formatNullableDateLabel(folder.closed_at),
    String(folder.item_count),
    formatNominalRupiah(folder.total_nominal_realisasi),
  ].map(normalizeSearchValue).filter(Boolean).join(' ')
}

function normalizeSearchValue(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const payload = error.payload
    if (payload && typeof payload === 'object' && 'error' in payload) {
      const message = payload.error
      if (typeof message === 'string') return message
    }
    return 'Gagal mengambil daftar berkas tertutup'
  }

  return 'Terjadi kesalahan'
}
