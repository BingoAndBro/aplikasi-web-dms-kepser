import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { PageLayout } from '#/components/dashboard/PageLayout'
import {
  PegawaiPageHeader,
  PegawaiPagination,
  PegawaiPanel,
  PegawaiSearchPanel,
} from '#/components/pegawai/PegawaiPagePrimitives'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { StatusBadge } from '#/components/ui/StatusBadge'
import {
  Plus,
  FileText,
  ChevronRight,
  Eye,
  FileEdit,
} from 'lucide-react'
import type { DokumenRow } from '#/lib/dokumen-helpers'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/pegawai/dokumen/')({
  validateSearch: z.object({
    status: z.string().optional(),
  }),
  component: DokumenSayaPage,
})

function StepBadge({ step }: { step: string | null }) {
  if (!step) return null
  const label = step === 'PPK' ? 'Step 1: PPK' : 'Step 2: PPSPM'
  return (
    <span className="rounded-full border border-orange-100 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-800">
      {label}
    </span>
  )
}

const PAGE_SIZE = 10

type AuthSessionResponse = {
  session: { userId: string; email: string; userName?: string | null } | null
  roles: string[]
  activeRole: string | null
}

function DokumenSayaPage() {
  const { status: statusParam } = Route.useSearch()
  const [items, setItems] = useState<DokumenRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(statusParam ?? '')
  const [page, setPage] = useState(0)

  useEffect(() => { fetchData() }, [])
  useEffect(() => { setStatusFilter(statusParam ?? '') }, [statusParam])

  async function fetchData() {
    setLoading(true)
    setFetchError(null)
    try {
      const auth = await apiFetch<AuthSessionResponse>('/auth/session')
      if (!auth.session) {
        setFetchError('Sesi tidak ditemukan. Silakan login ulang.')
        setLoading(false)
        return
      }

      const json = await apiFetch<{ dokumen?: DokumenRow[]; error?: string }>('/dokumen')
      if (json.error) {
        setFetchError(json.error)
        setLoading(false)
        return
      }
      setItems(json.dokumen ?? [])
    } catch (err) {
      if (err instanceof ApiError) {
        setFetchError(`Gagal mengambil data (HTTP ${err.status})`)
        return
      }

      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat mengambil data'
      setFetchError(msg)
    } finally {
      setLoading(false)
    }
  }

  const filtered = items.filter(d => {
    const query = search.toLowerCase()
    const matchSearch = !query
      || d.judul.toLowerCase().includes(query)
      || (d.fungsi_nama ?? '').toLowerCase().includes(query)
      || (d.kegiatan_nama ?? '').toLowerCase().includes(query)
    const matchStatus = !statusFilter || d.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <PageLayout>
      <div className="space-y-6">
        <PegawaiPageHeader
          eyebrow={
            <>
              <FileText size={12} />
              <span>Dokumen</span>
              <ChevronRight size={10} />
              <span>Dokumen Saya</span>
            </>
          }
          title="Dokumen Saya"
          description="Pantau dokumen Material dan Non-Material yang Anda ajukan, termasuk status validasi PPK, persetujuan PPSPM, revisi, dan dokumen yang sudah selesai."
          actions={
            <Link to="/pegawai/dokumen/aju">
              <Button size="sm" className="gap-1.5">
                <Plus size={14} />
                Ajukan Dokumen Baru
              </Button>
            </Link>
          }
        />

        <PegawaiSearchPanel
          search={search}
          onSearchChange={(value) => { setSearch(value); setPage(0) }}
          placeholder="Cari judul, fungsi, kegiatan..."
          resultLabel={`${filtered.length} dari ${items.length} dokumen`}
        >
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(0) }}
            className="h-10 rounded-xl border border-orange-100 bg-[#FFFDF9] px-3 text-sm text-zinc-900 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70"
          >
            <option value="">Semua Status</option>
            <option value="DRAFT">Draft</option>
            <option value="IN_PPK_VALIDATION">Menunggu PPK</option>
            <option value="IN_BENDAHARA_APPROVAL">Menunggu PPSPM</option>
            <option value="NEED_REVISION">Perlu Revisi</option>
            <option value="COMPLETED">Selesai</option>
            <option value="TERSIMPAN">Tersimpan</option>
            <option value="ARCHIVED">Diarsipkan</option>
          </select>
        </PegawaiSearchPanel>

        {loading ? (
          <LoadingState variant="list" rows={5} label="Memuat dokumen pegawai" />
        ) : fetchError ? (
          <ErrorState
            title="Gagal memuat dokumen"
            description={fetchError}
            variant="page"
            action={<Button variant="outline" size="sm" onClick={() => fetchData()}>Coba Lagi</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search || statusFilter ? 'Tidak ada dokumen yang cocok' : 'Belum ada dokumen'}
            description={search || statusFilter
              ? 'Ubah kata kunci atau status untuk melihat dokumen lain.'
              : 'Ajukan dokumen pertama Anda untuk memulai alur kerja.'}
            icon={<FileText size={20} />}
            action={!search && !statusFilter && (
              <Link to="/pegawai/dokumen/aju">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Plus size={14} />
                  Ajukan Dokumen Baru
                </Button>
              </Link>
            )}
          />
        ) : (
          <>
            <PegawaiPanel className="hidden overflow-hidden p-0 md:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-orange-50/70">
                      <TableHead className="w-12 text-center">No</TableHead>
                      <TableHead>Judul</TableHead>
                      <TableHead>Kegiatan</TableHead>
                      <TableHead className="text-center">Tahun</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Tanggal</TableHead>
                      <TableHead className="text-center w-20">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.map((dok, i) => (
                      <TableRow key={dok.id} className="group hover:bg-orange-50/50 transition-colors">
                        <TableCell className="text-center text-xs text-outline">
                          {page * PAGE_SIZE + i + 1}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-semibold text-sm text-on-surface line-clamp-1">{dok.judul}</p>
                            <p className="text-[10px] text-on-surface-variant mt-0.5">{dok.fungsi_nama ?? '-'}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-on-surface">{dok.kegiatan_nama ?? '-'}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs font-semibold text-on-surface">{dok.tahun}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <StatusBadge status={dok.status} className="text-[10px] font-semibold" />
                            <StepBadge step={dok.current_step} />
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs text-on-surface-variant">{formatDate(dok.tanggal)}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <DocumentActionLink dok={dok} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </PegawaiPanel>

            <div className="space-y-3 md:hidden">
              {paginated.map((dok, i) => {
                const isRevision = dok.status === 'NEED_REVISION' && dok.revision_target === 'USER'
                return (
                  <PegawaiPanel key={dok.id} className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700/70">
                          Dokumen #{page * PAGE_SIZE + i + 1}
                        </p>
                        <h2 className="mt-1 line-clamp-2 text-sm font-bold text-zinc-950">{dok.judul}</h2>
                      </div>
                      <StatusBadge status={dok.status} className="shrink-0 text-[10px] font-semibold" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
                      <div>
                        <p className="font-semibold text-zinc-500">Fungsi</p>
                        <p className="mt-0.5 text-zinc-900">{dok.fungsi_nama ?? '-'}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-500">Tahun</p>
                        <p className="mt-0.5 text-zinc-900">{dok.tahun}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="font-semibold text-zinc-500">Kegiatan</p>
                        <p className="mt-0.5 text-zinc-900">{dok.kegiatan_nama ?? '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-orange-100 pt-3">
                      <div className="space-y-1">
                        <p className="text-xs text-zinc-500">{formatDate(dok.tanggal)}</p>
                        <StepBadge step={dok.current_step} />
                      </div>
                      <DocumentActionLink dok={dok} mobile />
                    </div>
                  </PegawaiPanel>
                )
              })}
            </div>

            <PegawaiPagination
              page={page}
              totalPages={totalPages}
              onPrevious={() => setPage(p => Math.max(0, p - 1))}
              onNext={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            />
          </>
        )}
      </div>
    </PageLayout>
  )
}

function DocumentActionLink({ dok, mobile = false }: { dok: DokumenRow; mobile?: boolean }) {
  const isRevision = dok.status === 'NEED_REVISION' && dok.revision_target === 'USER'
  return (
    <Link
      to={isRevision ? '/pegawai/dokumen/$id/revisi' : '/pegawai/dokumen/$id'}
      params={{ id: dok.id }}
    >
      <Button
        size={mobile ? 'sm' : 'icon-xs'}
        variant={mobile && isRevision ? 'default' : mobile ? 'outline' : 'ghost'}
        className={mobile ? 'gap-1.5' : undefined}
        aria-label={isRevision ? `Revisi dokumen ${dok.judul}` : `Lihat detail dokumen ${dok.judul}`}
      >
        {isRevision ? (
          <FileEdit size={14} className={mobile ? undefined : 'text-amber-500'} />
        ) : (
          <Eye size={14} />
        )}
        {mobile ? (isRevision ? 'Revisi' : 'Detail') : null}
      </Button>
    </Link>
  )
}
