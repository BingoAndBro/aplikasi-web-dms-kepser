import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import {
  PegawaiPageHeader,
  PegawaiPanel,
} from '#/components/pegawai/PegawaiPagePrimitives'
import { BarChart3, ExternalLink, Users, ChevronRight, ShieldX, Filter } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { StatusBadge } from '#/components/ui/StatusBadge'
import { ApiError, apiFetch } from '#/lib/api-client'
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

  useEffect(() => {
    async function checkPermission() {
      setCheckingAuth(true)
      try {
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
          if (err instanceof ApiError) {
            const payload = err.payload
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
        <PegawaiPageHeader
          eyebrow={
            <>
              <BarChart3 size={12} />
              <span>Laporan</span>
              <ChevronRight size={10} />
              <span>Laporan Kegiatan</span>
            </>
          }
          title="Laporan Kegiatan"
          description="Pantau dokumen dari kegiatan yang pernah Anda pimpin sebagai Ketua Tim. Akses halaman ini tetap mengikuti otorisasi server."
        />

        {checkingAuth && (
          <LoadingState variant="page" label="Memeriksa akses laporan kegiatan" />
        )}

        {!checkingAuth && !isAuthorized && (
          <EmptyState
            title="Akses ditolak"
            description="Halaman Laporan Kegiatan hanya dapat diakses oleh Pegawai yang ditunjuk sebagai Ketua Tim pada suatu kegiatan."
            icon={<ShieldX size={20} />}
            action={<Button onClick={() => { window.location.href = '/' }}>Kembali ke Dashboard</Button>}
          />
        )}

        {!checkingAuth && isAuthorized && (
          <>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
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

              <PegawaiPanel className="space-y-3 bg-[#FFF8F1]">
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                    <Users size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-950">Cakupan Ketua Tim</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-700">
                      {allowedKegiatan.length} kegiatan terdaftar untuk akses laporan ini.
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-orange-100 bg-white/80 p-3 text-xs text-zinc-700">
                  <p className="font-semibold text-zinc-950">Ringkasan hasil</p>
                  <p className="mt-1">{new Set(filtered.map(d => d.pengaju_id)).size} pegawai dalam daftar terfilter.</p>
                </div>
              </PegawaiPanel>
            </div>

            {loading && <LoadingState variant="list" rows={4} label="Memuat laporan kegiatan" />}

            {!loading && error && (
              <ErrorState title="Gagal memuat laporan kegiatan" description={error} variant="page" />
            )}

            {!loading && !error && filtered.length === 0 && dokumen.length > 0 && (
              <EmptyState
                title="Tidak ada dokumen yang cocok"
                description="Reset filter untuk kembali melihat seluruh dokumen kegiatan."
                icon={<Filter size={20} />}
                action={<Button variant="outline" size="sm" onClick={() => setFilter({})}>Reset Filter</Button>}
              />
            )}

            {!loading && !error && filtered.length === 0 && dokumen.length === 0 && (
              <EmptyState
                title="Belum ada dokumen"
                description="Dokumen dari kegiatan Anda akan muncul di sini setelah ada pengajuan."
                icon={<Users size={20} />}
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
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Pengaju</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
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
                              className={`border-b last:border-0 hover:bg-orange-50/50 transition-colors ${isMe ? 'bg-orange-50/40' : ''}`}
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
                                {dok.kegiatan_nama ?? '-'}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span>{(dok as any).pengaju_nama ?? 'Tidak diketahui'}</span>
                                  {isMe && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-700 border-orange-200"
                                    >
                                      Anda
                                    </Badge>
                                  )}
                                </div>
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
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2.5 border-t bg-orange-50/40 text-xs text-muted-foreground">
                    Menampilkan {filtered.length} dari {dokumen.length} dokumen
                  </div>
                </PegawaiPanel>

                <div className="space-y-3 md:hidden">
                  {filtered.map((dok, idx) => {
                    const isMe = isCurrentUser(dok)
                    return (
                      <PegawaiPanel key={dok.id} className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700/70">
                              Kegiatan #{idx + 1}
                            </p>
                            <h2 className="mt-1 line-clamp-2 text-sm font-bold text-zinc-950">{dok.judul}</h2>
                          </div>
                          <StatusBadge status={dok.status} className="shrink-0 text-[10px] font-semibold" />
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
                          <div className="col-span-2">
                            <p className="font-semibold text-zinc-500">Kegiatan</p>
                            <p className="mt-0.5 text-zinc-900">{dok.kegiatan_nama ?? '-'}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-zinc-500">Pengaju</p>
                            <p className="mt-0.5 text-zinc-900">{(dok as any).pengaju_nama ?? 'Tidak diketahui'}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-zinc-500">Tanggal</p>
                            <p className="mt-0.5 text-zinc-900">{dok.tanggal ? new Date(dok.tanggal).toLocaleDateString('id-ID') : '-'}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-orange-100 pt-3">
                          {isMe ? (
                            <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-200">Anda</Badge>
                          ) : <span />}
                          <ReportDetailButton dok={dok} mobile />
                        </div>
                      </PegawaiPanel>
                    )
                  })}
                </div>
              </>
            )}
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
