import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import {
  PegawaiPageHeader,
  PegawaiPanel,
} from '#/components/pegawai/PegawaiPagePrimitives'
import { FileText, ExternalLink, Inbox, ChevronRight, Filter } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { StatusBadge } from '#/components/ui/StatusBadge'
import { ApiError, apiFetch } from '#/lib/api-client'
import { HierarchicalFilter, type HierarchicalFilterValue } from '#/components/laporan/HierarchicalFilter'
import type { DokumenLaporanRow } from '#/lib/dokumen-helpers'

export const Route = createFileRoute('/pegawai/laporan/saya')({
  component: LaporanSayaPage,
})

type LaporanSayaResponse = {
  dokumen?: DokumenLaporanRow[]
  error?: string
}

function LaporanSayaPage() {
  const [dokumen, setDokumen] = useState<DokumenLaporanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<HierarchicalFilterValue>({})

  useEffect(() => {
    apiFetch<LaporanSayaResponse>('/laporan/saya')
      .then(d => {
        if (d.error) { setError(d.error); return }
        setDokumen(d.dokumen ?? [])
      })
      .catch((error) => {
        if (error instanceof ApiError) {
          const payload = error.payload
          if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
            setError(payload.error)
            return
          }
        }
        setError('Gagal memuat data. Coba muat ulang halaman.')
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return dokumen.filter(d => {
      if (filter.fungsiId && d.fungsi_id !== filter.fungsiId) return false
      if (filter.kegiatanId && d.kegiatan_jenis_id !== filter.kegiatanId) return false
      if (filter.jenisId && (d as any).jenis_permintaan_id !== filter.jenisId) return false
      if (filter.kategoriId && (d as any).kategori_permintaan_id !== filter.kategoriId) return false
      if (filter.detailId && (d as any).detail_permintaan_id !== filter.detailId) return false
      if (filter.tanggalMulai && d.tanggal < filter.tanggalMulai) return false
      if (filter.tanggalAkhir && d.tanggal > filter.tanggalAkhir) return false
      return true
    })
  }, [dokumen, filter])

  return (
    <PageLayout>
      <div className="space-y-6">
        <PegawaiPageHeader
          eyebrow={
            <>
              <FileText size={12} />
              <span>Laporan</span>
              <ChevronRight size={10} />
              <span>Laporan Saya</span>
            </>
          }
          title="Laporan Saya"
          description="Lihat dokumen milik Anda yang sudah selesai diproses. Filter tetap lokal di halaman ini dan hanya memakai metadata dokumen yang sudah tersedia."
        />

        <PegawaiPanel className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Filter size={15} className="text-orange-700" />
              <p className="text-sm font-bold text-zinc-950">Filter Dokumen</p>
            </div>
            <p className="text-xs font-semibold text-zinc-500">
              {filtered.length} dari {dokumen.length} dokumen
            </p>
          </div>
          <HierarchicalFilter value={filter} onChange={setFilter} />
        </PegawaiPanel>

        {loading && <LoadingState variant="list" rows={4} label="Memuat laporan saya" />}

        {!loading && error && (
          <ErrorState title="Gagal memuat laporan" description={error} variant="page" />
        )}

        {!loading && !error && dokumen.length === 0 && (
          <EmptyState
            title="Belum ada dokumen selesai"
            description="Dokumen yang telah disetujui PPSPM atau tersimpan sebagai Non-Material akan muncul di sini."
            icon={<Inbox size={20} />}
          />
        )}

        {!loading && !error && dokumen.length > 0 && filtered.length === 0 && (
          <EmptyState
            title="Tidak ada dokumen yang cocok"
            description="Reset filter untuk kembali melihat seluruh dokumen selesai milik Anda."
            icon={<Filter size={20} />}
            action={<Button variant="outline" size="sm" onClick={() => setFilter({})}>Reset Filter</Button>}
          />
        )}

        {!loading && !error && filtered.length > 0 && (
          <>
            <PegawaiPanel className="hidden overflow-hidden p-0 md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-orange-50/70">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground w-8">No</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Judul Dokumen</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kegiatan</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tanggal Mulai</th>
                      <th className="px-4 py-3 text-center font-medium text-muted-foreground">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((dok, idx) => (
                      <tr key={dok.id} className="border-b last:border-0 hover:bg-orange-50/50 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{dok.judul}</div>
                          {(dok as any).leaf_node_nama && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {(dok as any).leaf_node_nama}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {dok.kegiatan_nama ?? '-'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={dok.status} className="text-[10px] font-semibold" />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {dok.tanggal
                            ? new Date(dok.tanggal).toLocaleDateString('id-ID', {
                                day: 'numeric', month: 'long', year: 'numeric',
                              })
                            : '-'
                          }
                        </td>
                        <td className="px-4 py-3 text-center">
                          <ReportDetailButton dok={dok} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 border-t bg-orange-50/40 text-xs text-muted-foreground">
                Menampilkan {filtered.length} dari {dokumen.length} dokumen
              </div>
            </PegawaiPanel>

            <div className="space-y-3 md:hidden">
              {filtered.map((dok, idx) => (
                <PegawaiPanel key={dok.id} className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700/70">
                        Laporan #{idx + 1}
                      </p>
                      <h2 className="mt-1 line-clamp-2 text-sm font-bold text-zinc-950">{dok.judul}</h2>
                    </div>
                    <StatusBadge status={dok.status} className="shrink-0 text-[10px] font-semibold" />
                  </div>
                  <div className="text-xs text-zinc-600">
                    <p className="font-semibold text-zinc-500">Kegiatan</p>
                    <p className="mt-0.5 text-zinc-900">{dok.kegiatan_nama ?? '-'}</p>
                    {(dok as any).leaf_node_nama && (
                      <p className="mt-1 text-zinc-500">{(dok as any).leaf_node_nama}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-orange-100 pt-3">
                    <p className="text-xs text-zinc-500">
                      {dok.tanggal ? new Date(dok.tanggal).toLocaleDateString('id-ID') : '-'}
                    </p>
                    <ReportDetailButton dok={dok} mobile />
                  </div>
                </PegawaiPanel>
              ))}
            </div>
          </>
        )}
      </div>
    </PageLayout>
  )
}

function ReportDetailButton({ dok, mobile = false }: { dok: DokumenLaporanRow; mobile?: boolean }) {
  return (
    <Link to="/pegawai/dokumen/$id" params={{ id: dok.id }}>
      <Button variant="outline" size="sm" className="gap-1.5" aria-label={`Lihat dokumen ${dok.judul}`}>
        <ExternalLink className="h-3.5 w-3.5" />
        {mobile ? 'Detail' : 'Lihat'}
      </Button>
    </Link>
  )
}
