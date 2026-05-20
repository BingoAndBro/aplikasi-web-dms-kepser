import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState, useMemo } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { BarChart3, ExternalLink, Users, ChevronRight, ShieldX } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { apiFetch } from '#/lib/api-client'
import { HierarchicalFilter, type HierarchicalFilterValue } from '#/components/laporan/HierarchicalFilter'
import type { DokumenLaporanRow } from '#/lib/dokumen-helpers'

export const Route = createFileRoute('/pegawai/laporan/kegiatan')({
  component: LaporanKegiatanPage,
})

type CurrentUserResponse = {
  user: {
    id: string
  }
}

type KetuaTimKegiatanResponse = {
  is_ketua_tim?: boolean
  kegiatan?: { id: string; nama: string }[]
}

type LaporanKegiatanResponse = {
  dokumen?: DokumenLaporanRow[]
  error?: string
}

function LaporanKegiatanPage() {
  const [dokumen, setDokumen] = useState<DokumenLaporanRow[]>([])
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [allowedKegiatan, setAllowedKegiatan] = useState<{ id: string; nama: string }[]>([])
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<HierarchicalFilterValue>({})
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Check authorization on mount
  useEffect(() => {
    async function checkPermission() {
      setCheckingAuth(true)
      try {
        // Get current user ID from session
        const meData = await apiFetch<CurrentUserResponse>('/users/me')
        setCurrentUserId(meData.user.id)

        let data: KetuaTimKegiatanResponse
        try {
          data = await apiFetch<KetuaTimKegiatanResponse>('/users/me/ketua-tim')
        } catch {
          setIsAuthorized(false)
          setLoading(false)
          return
        }

        if (!data.is_ketua_tim || !data.kegiatan || data.kegiatan.length === 0) {
          setIsAuthorized(false)
          setLoading(false)
          return
        }

        setIsAuthorized(true)
        setAllowedKegiatan(data.kegiatan)

        try {
          const d = await apiFetch<LaporanKegiatanResponse>('/laporan/kegiatan')
          if (d.error) { setError(d.error); return }
          setDokumen(d.dokumen ?? [])
        } catch (err) {
          if (err instanceof Error && err.name === 'ApiError') {
            const payload = (err as { payload?: unknown }).payload
            if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
              setError(payload.error)
              return
            }
          }
          throw err
        }
      } catch (err) {
        console.error('Permission check failed:', err)
        setIsAuthorized(false)
      } finally {
        setCheckingAuth(false)
        setLoading(false)
      }
    }

    checkPermission()
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

  const isCurrentUser = (dok: DokumenLaporanRow) => dok.pengaju_id === currentUserId

  return (
    <PageLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
            <BarChart3 size={12} />
            <span>Laporan</span>
            <ChevronRight size={10} />
            <span className="text-primary">Laporan Kegiatan</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">Laporan Kegiatan</h2>
          <p className="text-on-surface-variant text-xs mt-1">
            Seluruh dokumen dari kegiatan yang pernah Anda pimpin sebagai Ketua Tim.
          </p>
        </div>

        {/* State: checking authorization */}
        {checkingAuth && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-on-surface-variant">Memuat...</span>
            </div>
          </div>
        )}

        {/* State: not authorized / not a chairman */}
        {!checkingAuth && !isAuthorized && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="rounded-full bg-error/10 p-5">
              <ShieldX className="h-10 w-10 text-error/60" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-medium text-on-surface">Akses Ditolak</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Halaman Laporan Kegiatan hanya dapat diakses oleh user yang ditunjuk sebagai
                Ketua Tim pada suatu kegiatan.
              </p>
            </div>
            <Button onClick={() => window.location.href = '/'}>
              Kembali ke Dashboard
            </Button>
          </div>
        )}

        {/* State: authorized - show content */}
        {!checkingAuth && isAuthorized && (
          <>
            {/* Filter */}
            <HierarchicalFilter value={filter} onChange={setFilter} />

            {/* State: loading */}
            {loading && (
              <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
                Memuat data...
              </div>
            )}

            {/* State: error */}
            {!loading && error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* State: ada dokumen Ketua Tim tapi filter kosong hasil */}
            {!loading && !error && filtered.length === 0 && dokumen.length > 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                <p className="text-sm text-muted-foreground">Tidak ada dokumen yang cocok dengan filter saat ini.</p>
                <Button variant="ghost" size="sm" onClick={() => setFilter({})}>Reset Filter</Button>
              </div>
            )}

            {/* State: no documents yet */}
            {!loading && !error && filtered.length === 0 && dokumen.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                <div className="rounded-full bg-violet-500/10 p-5">
                  <Users className="h-10 w-10 text-violet-500/60" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-medium">Belum ada dokumen</p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Dokumen dari kegiatan Anda akan muncul di sini setelah ada yang diajukan.
                  </p>
                </div>
              </div>
            )}

            {/* Tabel */}
            {!loading && !error && filtered.length > 0 && (
              <>
                {/* Ringkasan */}
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">{filtered.length}</span> dokumen
                  </span>
                  <span>·</span>
                  <span>
                    <span className="font-medium text-foreground">
                      {new Set(filtered.map(d => d.pengaju_id)).size}
                    </span> pegawai
                  </span>
                </div>

                <div className="rounded-xl border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground w-8">No</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Judul Dokumen</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kegiatan</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Pengaju</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tanggal Mulai</th>
                          <th className="px-4 py-3 text-center font-medium text-muted-foreground">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((dok, idx) => {
                          const isMe = isCurrentUser(dok)
                          return (
                            <tr
                              key={dok.id}
                              className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${isMe ? 'bg-violet-500/5' : ''}`}
                            >
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
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span>{(dok as any).pengaju_nama ?? 'Unknown'}</span>
                                  {isMe && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] px-1.5 py-0 bg-violet-500/15 text-violet-600 border-violet-500/20"
                                    >
                                      Anda
                                    </Badge>
                                  )}
                                </div>
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
                                  <Button variant="outline" size="sm" className="gap-1.5" aria-label={`Lihat dokumen ${dok.judul}`}>
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    Lihat
                                  </Button>
                                </Link>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2.5 border-t bg-muted/20 text-xs text-muted-foreground">
                    Menampilkan {filtered.length} dari {dokumen.length} dokumen
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </PageLayout>
  )
}
