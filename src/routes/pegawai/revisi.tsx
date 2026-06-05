import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import {
  PegawaiPageHeader,
  PegawaiPagination,
  PegawaiPanel,
  PegawaiSearchPanel,
} from '#/components/pegawai/PegawaiPagePrimitives'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { DocumentListStatusBadge } from '#/components/workflow/PpkPpspmPagePrimitives'
import {
  FileText,
  ChevronRight,
} from 'lucide-react'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiFetch } from '#/lib/api-client'

type Item = {
  id: string
  judul: string
  fungsi_nama: string
  kegiatan_nama: string
  status: string
  current_step: string | null
  revision_target: string | null
  tahun: number
  tanggal: string
  created_at: string
  updated_at: string
  revision_notes: string | null
}

export const Route = createFileRoute('/pegawai/revisi')({
  preload: false,
  component: PegawaiRevisiPage,
})

const PAGE_SIZE = 10

function PegawaiRevisiPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    apiFetch<{ dokumen?: Item[] }>('/pegawai/revisi')
      .then(d => { setItems(d.dokumen ?? []); setLoading(false) })
      .catch((err) => {
        if (err instanceof ApiError) {
          const payload = err.payload
          setItems(payload && typeof payload === 'object' && 'dokumen' in payload
            ? (payload as { dokumen?: Item[] }).dokumen ?? []
            : [])
          setLoading(false)
          return
        }

        setError('Gagal memuat data')
        setLoading(false)
      })
  }, [])

  const filtered = items.filter(d => {
    const query = search.toLowerCase()
    return !query
      || d.judul.toLowerCase().includes(query)
      || (d.fungsi_nama ?? '').toLowerCase().includes(query)
      || (d.kegiatan_nama ?? '').toLowerCase().includes(query)
      || (d.revision_notes ?? '').toLowerCase().includes(query)
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function openRevision(dok: Item) {
    navigate({ to: '/pegawai/dokumen/$id/revisi', params: { id: dok.id } })
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <PegawaiPageHeader
          eyebrow={
            <>
              <FileText size={12} />
              <span>Dokumen</span>
              <ChevronRight size={10} />
              <span>Revisi Dokumen</span>
            </>
          }
          title="Revisi Dokumen"
          description="Dokumen yang dikembalikan untuk diperbaiki muncul di sini. Baca catatan revisi, perbarui lampiran atau metadata yang diminta, lalu ajukan ulang."
        />

        <PegawaiSearchPanel
          search={search}
          onSearchChange={(value) => { setSearch(value); setPage(0) }}
          placeholder="Cari judul, fungsi, kegiatan, atau catatan..."
          resultLabel={`${filtered.length} dokumen perlu ditinjau`}
        />

        {loading ? (
          <LoadingState variant="list" rows={4} label="Memuat revisi dokumen" />
        ) : error ? (
          <ErrorState title="Gagal memuat revisi" description={error} variant="page" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search ? 'Tidak ada revisi yang cocok' : 'Tidak ada dokumen revisi'}
            description={search
              ? 'Ubah kata kunci pencarian untuk melihat revisi lain.'
              : 'Dokumen yang dikembalikan oleh PPK atau PPSPM akan muncul di halaman ini.'}
            icon={<FileText size={20} />}
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
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Tanggal</TableHead>
                      <TableHead className="text-center w-20">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.map((dok, i) => (
                      <TableRow
                        key={dok.id}
                        className="group cursor-pointer hover:bg-orange-50/50 transition-colors"
                        onClick={() => openRevision(dok)}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openRevision(dok)
                          }
                        }}
                        aria-label={`Buka dokumen revisi ${dok.judul}`}
                      >
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
                          <DocumentListStatusBadge status={dok.status} />
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs text-on-surface-variant">{formatDate(dok.tanggal)}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button size="icon-xs" variant="ghost" aria-label={`Buka dokumen revisi ${dok.judul}`}>
                            <ChevronRight size={14} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </PegawaiPanel>

            <div className="space-y-3 md:hidden">
              {paginated.map((dok, i) => (
                <PegawaiPanel key={dok.id} className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700/70">
                        Revisi #{page * PAGE_SIZE + i + 1}
                      </p>
                      <h2 className="mt-1 line-clamp-2 text-sm font-bold text-zinc-950">{dok.judul}</h2>
                    </div>
                    <DocumentListStatusBadge status={dok.status} className="shrink-0" />
                  </div>
                  <div className="space-y-2 rounded-xl bg-orange-50/50 p-3 text-xs text-zinc-700">
                    <p className="font-semibold text-zinc-950">Catatan revisi</p>
                    <p className="line-clamp-3">{dok.revision_notes ?? 'Tidak ada catatan tambahan.'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
                    <div className="rounded-xl border border-orange-100 bg-[#FFFDF9] p-2.5">
                      <p className="font-semibold text-zinc-500">Fungsi</p>
                      <p className="mt-0.5 text-zinc-900">{dok.fungsi_nama ?? '-'}</p>
                    </div>
                    <div className="rounded-xl border border-orange-100 bg-[#FFFDF9] p-2.5">
                      <p className="font-semibold text-zinc-500">Tanggal</p>
                      <p className="mt-0.5 text-zinc-900">{formatDate(dok.tanggal)}</p>
                    </div>
                    <div className="col-span-2 rounded-xl border border-orange-100 bg-[#FFFDF9] p-2.5">
                      <p className="font-semibold text-zinc-500">Kegiatan</p>
                      <p className="mt-0.5 text-zinc-900">{dok.kegiatan_nama ?? '-'}</p>
                    </div>
                  </div>
                  <div className="space-y-3 border-t border-orange-100 pt-3">
                    <RevisionActionLink dok={dok} mobile />
                  </div>
                </PegawaiPanel>
              ))}
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

function RevisionActionLink({ dok, mobile = false }: { dok: Item; mobile?: boolean }) {
  return (
    <Link to="/pegawai/dokumen/$id/revisi" params={{ id: dok.id }} className={mobile ? 'block w-full' : undefined}>
      <Button
        size={mobile ? 'sm' : 'icon-xs'}
        variant={mobile ? 'default' : 'ghost'}
        className={mobile ? 'w-full gap-1.5' : undefined}
        aria-label={`Revisi dokumen ${dok.judul}`}
      >
        <ChevronRight size={14} />
        {mobile ? 'Buka Dokumen' : null}
      </Button>
    </Link>
  )
}
