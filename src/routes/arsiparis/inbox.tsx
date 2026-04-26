import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import {
  FileText, ChevronRight, Eye, AlertCircle, Loader2,
  Banknote, Clock,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { getBrowserClient } from '#/lib/supabase-browser'

export const Route = createFileRoute('/arsiparis/inbox')({ component: ArsiparisInboxPage })

type InboxItem = {
  id: string
  judul: string
  fungsi_id: string
  fungsi_nama: string
  kegiatan_jenis_id: string
  kegiatan_nama: string
  nama_pegawai: string
  tahun: number
  tanggal: string
  created_at: string
  bendahara_approve_at: string | null
}

function ArsiparisInboxPage() {
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fungsiList, setFungsiList] = useState<{ id: string; nama: string }[]>([])
  const [fungsiFilter, setFungsiFilter] = useState('')

  useEffect(() => {
    const supabase = getBrowserClient()
    if (!supabase) return
    supabase.from('master_fungsi').select('id, nama').eq('is_active', true).order('nama').then(({ data }: { data: { id: string; nama: string }[] | null }) => {
      setFungsiList(data ?? [])
    })
  }, [])

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      if (fungsiFilter) params.set('fungsi_id', fungsiFilter)
      const res = await fetch(`/api/arsiparis/inbox?${params}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Gagal'); setLoading(false); return }
      setItems(json.inbox ?? [])
    } catch { setError('Terjadi kesalahan') } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [fungsiFilter])

  function formatDate(str: string) {
    try { return new Date(str).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return str }
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
            <Banknote size={12} />
            <Link to="/arsiparis" className="hover:text-primary">Arsiparis</Link>
            <ChevronRight size={10} />
            <span className="text-primary">Pemberkasan Arsip</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">Pemberkasan Arsip</h2>
          <p className="text-on-surface-variant text-xs mt-1">{items.length} dokumen menunggu untuk diarsipkan.</p>
        </div>

        <div className="flex gap-3">
          <select
            value={fungsiFilter}
            onChange={e => setFungsiFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-border rounded-lg text-xs cursor-pointer"
          >
            <option value="">Semua Fungsi</option>
            {fungsiList.map(f => <option key={f.id} value={f.id}>{f.nama}</option>)}
          </select>
          {fungsiFilter && <Button variant="ghost" size="sm" onClick={() => setFungsiFilter('')}>Reset</Button>}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center py-20 gap-4 bg-error/5 rounded-2xl border border-error/20">
            <AlertCircle size={32} className="text-error" />
            <p className="text-sm text-on-surface-variant">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-4 bg-white/5 rounded-2xl border border-white/10">
            <div className="w-14 h-14 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Clock size={24} className="text-blue-500" />
            </div>
            <p className="font-headline text-lg font-bold text-on-surface">Tidak ada dokumen</p>
            <p className="text-on-surface-variant text-xs text-center max-w-sm">
              Dokumen yang telah disetujui Bendahara dan belum diarsipkan akan muncul di sini.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-container-low/30 text-left">
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider w-10 text-center">No</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Judul</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Fungsi</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Kegiatan</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Tahun</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Tanggal Approve</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center w-20">Proses</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d, i) => (
                    <tr key={d.id} className="border-t border-outline-variant/20 hover:bg-primary/5 transition-colors">
                      <td className="px-4 py-3 text-center text-outline">{i + 1}</td>
                      <td className="px-4 py-3"><p className="font-semibold text-on-surface line-clamp-1">{d.judul}</p></td>
                      <td className="px-4 py-3 text-on-surface">{d.fungsi_nama ?? '—'}</td>
                      <td className="px-4 py-3 text-on-surface">{d.kegiatan_nama ?? '—'}</td>
                      <td className="px-4 py-3 text-center font-semibold text-on-surface">{d.tahun}</td>
                      <td className="px-4 py-3 text-center text-on-surface-variant">
                        {d.bendahara_approve_at ? formatDate(d.bendahara_approve_at) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link to="/arsiparis/dokumen/$id" params={{ id: d.id }}>
                          <Button size="icon-xs" variant="ghost" aria-label="Lihat detail"><Eye size={14} /></Button>
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
