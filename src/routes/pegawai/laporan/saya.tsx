import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState, useMemo } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { FileText, ExternalLink, Inbox, ChevronRight } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { HierarchicalFilter, type HierarchicalFilterValue } from '#/components/laporan/HierarchicalFilter'
import type { DokumenLaporanRow } from '#/lib/dokumen-helpers'

export const Route = createFileRoute('/pegawai/laporan/saya')({
  component: LaporanSayaPage,
})

function LaporanSayaPage() {
  const [dokumen, setDokumen] = useState<DokumenLaporanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<HierarchicalFilterValue>({})

  useEffect(() => {
    fetch('/api/laporan/saya', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setDokumen(d.dokumen ?? [])
      })
      .catch(() => setError('Gagal memuat data. Coba muat ulang halaman.'))
      .finally(() => setLoading(false))
  }, [])

  // Terapkan filter client-side
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
        {/* Header */}
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
            <FileText size={12} />
            <span>Laporan</span>
            <ChevronRight size={10} />
            <span className="text-primary">Laporan Saya</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">Laporan Saya</h2>
          <p className="text-on-surface-variant text-xs mt-1">
            Daftar seluruh dokumen Anda yang telah selesai diproses.
          </p>
        </div>

        {/* Filter */}
        <HierarchicalFilter value={filter} onChange={setFilter} />

        {/* State: loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            Memuat data…
          </div>
        )}

        {/* State: error */}
        {!loading && error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* State: kosong dari server */}
        {!loading && !error && dokumen.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-base font-medium text-muted-foreground">Belum ada dokumen selesai</p>
            <p className="text-sm text-muted-foreground/70">
              Dokumen yang telah disetujui Bendahara akan muncul di sini.
            </p>
          </div>
        )}

        {/* State: ada dokumen tapi filter tidak cocok */}
        {!loading && !error && dokumen.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <p className="text-sm text-muted-foreground">Tidak ada dokumen yang cocok dengan filter saat ini.</p>
            <Button variant="ghost" size="sm" onClick={() => setFilter({})}>Reset Filter</Button>
          </div>
        )}

        {/* Tabel */}
        {!loading && !error && filtered.length > 0 && (
          <div className="rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground w-8">No</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Judul Dokumen</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kegiatan</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tanggal Mulai</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((dok, idx) => (
                    <tr key={dok.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
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
                        {dok.kegiatan_nama ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {dok.tanggal
                          ? new Date(dok.tanggal).toLocaleDateString('id-ID', {
                              day: 'numeric', month: 'long', year: 'numeric',
                            })
                          : '—'
                        }
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link to="/pegawai/dokumen/$id" params={{ id: dok.id }}>
                          <Button variant="outline" size="sm" className="gap-1.5">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Lihat
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t bg-muted/20 text-xs text-muted-foreground">
              Menampilkan {filtered.length} dari {dokumen.length} dokumen
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  )
}
