import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import {
  Archive, ChevronRight, AlertCircle, Loader2,
  Search, Eye,
} from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { getBrowserClient } from '#/lib/supabase-browser'

export const Route = createFileRoute('/arsiparis/search')({ component: ArsipSearchPage })

type ArsipItem = {
  id: string
  nomor_surat: string
  judul: string
  fungsi_nama: string
  kegiatan_nama: string
  klasifikasi: string
  archived_at: string
  status_arsip: string
}

const PER_PAGE = 20

function ArsipSearchPage() {
  const [items, setItems] = useState<ArsipItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fungsiList, setFungsiList] = useState<{ id: string; nama: string }[]>([])
  const [kegiatanList, setKegiatanList] = useState<{ id: string; nama: string }[]>([])
  const [fungsiFilter, setFungsiFilter] = useState('')
  const [kegiatanFilter, setKegiatanFilter] = useState('')
  const [tahun, setTahun] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    const supabase = getBrowserClient()
    if (!supabase) return
    supabase.from('master_fungsi').select('id, nama').eq('is_active', true).order('nama').then(({ data }: { data: { id: string; nama: string }[] | null }) => {
      setFungsiList(data ?? [])
    })
    supabase.from('master_kegiatan').select('id, nama').eq('is_active', true).order('nama').then(({ data }: { data: { id: string; nama: string }[] | null }) => {
      setKegiatanList(data ?? [])
    })
  }, [])

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      if (fungsiFilter) params.set('fungsi_id', fungsiFilter)
      if (kegiatanFilter) params.set('kegiatan_id', kegiatanFilter)
      if (tahun) params.set('tahun', tahun)
      if (q) params.set('q', q)
      params.set('page', String(page))
      const res = await fetch(`/api/arsiparis/search?${params}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Gagal'); setLoading(false); return }
      setItems(json.arsip ?? [])
      setTotal(json.total ?? 0)
    } catch { setError('Terjadi kesalahan') } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [fungsiFilter, kegiatanFilter, tahun, q, page])

  function resetFilters() {
    setFungsiFilter(''); setKegiatanFilter(''); setTahun(''); setQ(''); setPage(1)
  }

  function formatDate(str: string) {
    try { return new Date(str).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return str }
  }

  function statusBadge(s: string) {
    if (s === 'AKTIF') return <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">AKTIF</Badge>
    if (s === 'INAKTIF') return <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px]">INAKTIF</Badge>
    if (s === 'USUL_MUSNAH') return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">USUL MUSNAH</Badge>
    if (s === 'DIMUSNAHKAN') return <Badge className="bg-gray-100 text-gray-500 border-gray-300 text-[10px]">DIMUSNAHKAN</Badge>
    return <Badge className="bg-gray-100 text-gray-500 text-[10px]">{s}</Badge>
  }

  function getDetailUrl(a: ArsipItem) {
    if (a.status_arsip === 'AKTIF') return '/arsiparis/aktif/' + a.id
    if (a.status_arsip === 'INAKTIF') return '/arsiparis/inaktif/' + a.id
    if (a.status_arsip === 'USUL_MUSNAH') return '/arsiparis/usul-musnah/' + a.id
    return null
  }

  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <PageLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
            <Link to="/arsiparis" className="hover:text-primary">Arsiparis</Link>
            <ChevronRight size={10} />
            <span className="text-primary">Pencarian Arsip</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">Pencarian Arsip</h2>
          <p className="text-on-surface-variant text-xs mt-1">Temukan arsip dokumen yang sudah diarsipkan.</p>
        </div>

        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface mb-1.5">Fungsi</label>
              <select
                value={fungsiFilter}
                onChange={e => { setFungsiFilter(e.target.value); setPage(1) }}
                className="w-full px-3 py-2 border border-border rounded-lg text-xs cursor-pointer"
              >
                <option value="">Semua Fungsi</option>
                {fungsiList.map(f => <option key={f.id} value={f.id}>{f.nama}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface mb-1.5">Kegiatan</label>
              <select
                value={kegiatanFilter}
                onChange={e => { setKegiatanFilter(e.target.value); setPage(1) }}
                className="w-full px-3 py-2 border border-border rounded-lg text-xs cursor-pointer"
              >
                <option value="">Semua Kegiatan</option>
                {kegiatanList.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface mb-1.5">Tahun</label>
              <input
                type="number"
                value={tahun}
                onChange={e => { setTahun(e.target.value); setPage(1) }}
                placeholder="Contoh: 2025"
                className="w-full px-3 py-2 border border-border rounded-lg text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface mb-1.5">Kata Kunci</label>
              <input
                type="text"
                value={q}
                onChange={e => { setQ(e.target.value); setPage(1) }}
                placeholder="Nomor surat atau judul..."
                className="w-full px-3 py-2 border border-border rounded-lg text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={fetchData} className="gap-1.5">
              <Search size={12} />Cari
            </Button>
            <Button variant="ghost" size="sm" onClick={resetFilters}>Reset</Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-primary" /></div>
        ) : error ? (
          <div className="flex flex-col items-center py-20 gap-4 bg-error/5 rounded-2xl border border-error/20">
            <AlertCircle size={32} className="text-error" /><p className="text-sm text-on-surface-variant">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-4 bg-white/5 rounded-2xl border border-white/10">
            <div className="w-14 h-14 rounded-xl bg-blue-500/10 flex items-center justify-center"><Archive size={24} className="text-blue-500" /></div>
            <p className="font-headline text-lg font-bold text-on-surface">Tidak ada arsip</p>
            <p className="text-on-surface-variant text-xs">Tidak ada arsip yang sesuai dengan filter pencarian.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-container-low/30 text-left">
                      <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider w-10 text-center">No</th>
                      <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Nomor Surat</th>
                      <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Judul</th>
                      <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Fungsi</th>
                      <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Kegiatan</th>
                      <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Tanggal Arsip</th>
                      <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((a, i) => (
                      <tr key={a.id} className="border-t border-outline-variant/20 hover:bg-primary/5 transition-colors">
                        <td className="px-4 py-3 text-center text-outline">{i + 1}</td>
                        <td className="px-4 py-3 font-semibold text-on-surface">{a.nomor_surat}</td>
                        <td className="px-4 py-3 text-on-surface line-clamp-1">{a.judul}</td>
                        <td className="px-4 py-3 text-on-surface">{a.fungsi_nama}</td>
                        <td className="px-4 py-3 text-on-surface">{a.kegiatan_nama}</td>
                        <td className="px-4 py-3 text-center text-on-surface-variant">{formatDate(a.archived_at)}</td>
                        <td className="px-4 py-3 text-center">{statusBadge(a.status_arsip)}</td>
                        <td className="px-4 py-3 text-center">
                          {getDetailUrl(a) ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); window.location.href = getDetailUrl(a)! }}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-surface-container-low transition-colors"
                              aria-label="Lihat detail"
                            >
                              <Eye size={14} className="text-primary" />
                            </button>
                          ) : (
                            <span className="text-outline text-[10px]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button size="icon-xs" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</Button>
                <span className="text-xs text-on-surface-variant px-2">Halaman {page} dari {totalPages}</span>
                <Button size="icon-xs" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</Button>
              </div>
            )}
          </>
        )}
      </div>
    </PageLayout>
  )
}
