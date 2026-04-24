import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import {
  ArchiveX, ChevronRight, AlertCircle, Loader2,
  Trash2, Clock, FileText,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { getBrowserClient } from '#/lib/supabase-browser'

export const Route = createFileRoute('/arsiparis/inaktif')({ component: ArsipInaktifPage })

type ArsipInaktifItem = {
  id: string
  nomor_surat: string
  judul_dokumen: string
  fungsi_nama: string
  kegiatan_nama: string
  archived_at: string
  masa_aktif_berakhir: string
  masa_inaktif_berakhir: string
}

function ArsipInaktifPage() {
  const [items, setItems] = useState<ArsipInaktifItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fungsiList, setFungsiList] = useState<{ id: string; nama: string }[]>([])
  const [fungsiFilter, setFungsiFilter] = useState('')

  const [musnahOpen, setMusnahOpen] = useState(false)
  const [selectedArsip, setSelectedArsip] = useState<ArsipInaktifItem | null>(null)
  const [catatan, setCatatan] = useState('')
  const [musnahLoading, setMusnahLoading] = useState(false)
  const [musnahError, setMusnahError] = useState<string | null>(null)

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
      const res = await fetch(`/api/arsiparis/inaktif?${params}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Gagal'); setLoading(false); return }
      setItems(json.inaktif ?? [])
    } catch { setError('Terjadi kesalahan') } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [fungsiFilter])

  function formatDate(str: string) {
    try { return new Date(str).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return str }
  }

  function openMusnah(arsip: ArsipInaktifItem) {
    setSelectedArsip(arsip); setCatatan(''); setMusnahError(null); setMusnahOpen(true)
  }

  async function handleMusnah() {
    if (!selectedArsip) return
    setMusnahLoading(true); setMusnahError(null)
    try {
      const res = await fetch('/api/arsiparis/usul-musnah/pindahkan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arsip_id: selectedArsip.id, catatan: catatan.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) { setMusnahError(json.error ?? 'Gagal'); setMusnahLoading(false); return }
      setMusnahOpen(false); setSelectedArsip(null); fetchData()
    } catch { setMusnahError('Terjadi kesalahan'); setMusnahLoading(false) }
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
            <Link to="/arsiparis" className="hover:text-primary">Arsiparis</Link>
            <ChevronRight size={10} />
            <span className="text-primary">Daftar Arsip Inaktif</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">Daftar Arsip Inaktif</h2>
          <p className="text-on-surface-variant text-xs mt-1">{items.length} arsip dalam masa inaktif.</p>
        </div>

        <div className="flex gap-3">
          <select value={fungsiFilter} onChange={e => setFungsiFilter(e.target.value)} className="px-3 py-2 bg-white border border-border rounded-lg text-xs cursor-pointer">
            <option value="">Semua Fungsi</option>
            {fungsiList.map(f => <option key={f.id} value={f.id}>{f.nama}</option>)}
          </select>
          {fungsiFilter && <Button variant="ghost" size="sm" onClick={() => setFungsiFilter('')}>Reset</Button>}
        </div>

        {/* Musnah Modal */}
        {musnahOpen && selectedArsip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) setMusnahOpen(false) }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant/30">
                <Trash2 size={18} className="text-amber-500 shrink-0" />
                <p className="font-semibold text-on-surface">Usulkan Pemusnahan?</p>
              </div>
              <div className="p-5 space-y-4">
                <div className="p-3 bg-surface-container-low/30 rounded-lg space-y-1">
                  <p className="text-xs font-semibold text-on-surface">{selectedArsip.nomor_surat}</p>
                  <p className="text-xs text-on-surface-variant">{selectedArsip.judul_dokumen}</p>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700 font-semibold">PERHATIAN</p>
                  <p className="text-xs text-amber-600 mt-1">Arsip akan diusulkan untuk dimusnahkan. Persetujuan akhir diperlukan sebelum dokumen dihapus permanen.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">Catatan <span className="text-outline font-normal">(opsional)</span></label>
                  <textarea value={catatan} onChange={e => setCatatan(e.target.value)} rows={3}
                    className={cn('w-full px-3 py-2 border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring resize-none', musnahError ? 'border-error' : 'border-border')}
                  />
                  {musnahError && <p className="text-[10px] text-error mt-1">{musnahError}</p>}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setMusnahOpen(false)} disabled={!!musnahLoading}>Batal</Button>
                  <Button className="flex-1 gap-1.5" onClick={handleMusnah} disabled={!!musnahLoading}>
                    {musnahLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Ya, Usulkan
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-primary" /></div>
        ) : error ? (
          <div className="flex flex-col items-center py-20 gap-4 bg-error/5 rounded-2xl border border-error/20">
            <AlertCircle size={32} className="text-error" /><p className="text-sm text-on-surface-variant">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-4 bg-white/5 rounded-2xl border border-white/10">
            <div className="w-14 h-14 rounded-xl bg-blue-500/10 flex items-center justify-center"><ArchiveX size={24} className="text-blue-500" /></div>
            <p className="font-headline text-lg font-bold text-on-surface">Tidak ada arsip inaktif</p>
            <p className="text-on-surface-variant text-xs">Arsip yang sudah tidak aktif akan muncul di sini.</p>
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
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Fungsi</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Kegiatan</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Masa Inaktif Berakhir</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center w-20">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a, i) => (
                    <tr key={a.id} className="border-t border-outline-variant/20 hover:bg-primary/5 transition-colors">
                      <td className="px-4 py-3 text-center text-outline">{i + 1}</td>
                      <td className="px-4 py-3 font-semibold text-on-surface">{a.nomor_surat}</td>
                      <td className="px-4 py-3 text-on-surface line-clamp-1">{a.judul_dokumen}</td>
                      <td className="px-4 py-3 text-on-surface">{a.fungsi_nama}</td>
                      <td className="px-4 py-3 text-on-surface">{a.kegiatan_nama}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn('text-xs font-semibold', new Date(a.masa_inaktif_berakhir) < new Date() ? 'text-error' : 'text-on-surface')}>
                          {formatDate(a.masa_inaktif_berakhir)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button size="icon-xs" variant="ghost" onClick={() => openMusnah(a)} aria-label="Usulkan musnah"><Trash2 size={14} /></Button>
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
