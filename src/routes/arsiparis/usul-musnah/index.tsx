import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { ApiError, apiFetch } from '#/lib/api-client'
import { formatDate } from '#/lib/utils/format'
import {
  Trash2, ChevronRight, AlertCircle, Loader2,
  Eye,
} from 'lucide-react'

export const Route = createFileRoute('/arsiparis/usul-musnah/')({ component: UsulMusnahPage })

type MusnahItem = {
  arsip_id: string
  musnah_id: string
  nomor_surat: string
  judul_dokumen: string
  musnah_status: 'MENUNGGU' | 'DISETUJUI' | 'DITOLAK'
  diusulkan_oleh: string
  created_at: string
  decided_by: string | null
  decided_at: string | null
  catatan: string | null
}

type UsulMusnahResponse = {
  usul_musnah?: MusnahItem[]
  error?: string
}

type FungsiOption = { id: string; nama: string }

function UsulMusnahPage() {
  const [items, setItems] = useState<MusnahItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fungsiList, setFungsiList] = useState<{ id: string; nama: string }[]>([])
  const [fungsiFilter, setFungsiFilter] = useState('')

  useEffect(() => {
    apiFetch<FungsiOption[]>('/master-fungsi')
      .then(data => { setFungsiList(data) })
      .catch(() => { setFungsiList([]) })
  }, [])

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      if (fungsiFilter) params.set('fungsi_id', fungsiFilter)
      const json = await apiFetch<UsulMusnahResponse>('/arsiparis/usul-musnah', { query: params })
      setItems(json.usul_musnah ?? [])
    } catch (error) {
      if (error instanceof ApiError) {
        const payload = error.payload
        if (payload && typeof payload === 'object' && 'error' in payload) {
          setError(typeof payload.error === 'string' ? payload.error : 'Gagal')
        } else {
          setError('Gagal')
        }
      } else {
        setError('Terjadi kesalahan')
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [fungsiFilter])



  const statusBadge = (status: MusnahItem['musnah_status']) => {
    if (status === 'MENUNGGU') return <Badge className='bg-amber-100 text-amber-700 border-amber-200 text-xs'>MENUNGGU</Badge>
    if (status === 'DISETUJUI') return <Badge className='bg-green-100 text-green-700 border-green-200 text-xs'>DISETUJUI</Badge>
    return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">DITOLAK</Badge>
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
            <Link to="/arsiparis" className="hover:text-primary">Kepala Sub Bagian Umum</Link>
            <ChevronRight size={10} />
            <span className="text-primary">Usul Musnah</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">Usul Musnah</h2>
          <p className="text-on-surface-variant text-xs mt-1">{items.length} pengajuan pemusnahan.</p>
        </div>

        <div className="flex gap-3">
          <select value={fungsiFilter} onChange={e => setFungsiFilter(e.target.value)} className="px-3 py-2 bg-white border border-border rounded-lg text-xs cursor-pointer">
            <option value="">Semua Fungsi</option>
            {fungsiList.map(f => <option key={f.id} value={f.id}>{f.nama}</option>)}
          </select>
          {fungsiFilter && <Button variant="ghost" size="sm" onClick={() => setFungsiFilter('')}>Reset</Button>}
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
            <div className="w-14 h-14 rounded-xl bg-blue-500/10 flex items-center justify-center"><Trash2 size={24} className="text-blue-500" /></div>
            <p className="font-headline text-lg font-bold text-on-surface">Tidak ada pengajuan</p>
            <p className="text-on-surface-variant text-xs">Pengajuan pemusnahan arsip akan muncul di sini.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-container-low/30 text-left">
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider w-10 text-center">No</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Nomor Surat</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Judul</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Tanggal Usul</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Status</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center w-16">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a, i) => (
                    <tr key={a.musnah_id} className="border-t border-outline-variant/20 hover:bg-primary/5 transition-colors">
                      <td className="px-4 py-3 text-center text-outline">{i + 1}</td>
                      <td className="px-4 py-3 font-semibold text-on-surface">{a.nomor_surat}</td>
                      <td className="px-4 py-3 text-on-surface line-clamp-1">{a.judul_dokumen}</td>
                      <td className="px-4 py-3 text-center text-on-surface-variant">{formatDate(a.created_at)}</td>
                      <td className="px-4 py-3 text-center">{statusBadge(a.musnah_status)}</td>
                      <td className="px-4 py-3 text-center">
                        <Link to="/arsiparis/usul-musnah/$id" params={{ id: a.musnah_id }}>
                          <Button size="icon-xs" variant="ghost" aria-label={`Lihat detail usul musnah ${a.nomor_surat}`}><Eye size={14} /></Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  )
}
