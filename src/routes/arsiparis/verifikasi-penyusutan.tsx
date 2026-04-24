import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  ClipboardCheck, ChevronRight, AlertCircle, Loader2,
  CheckCircle2, X, AlertTriangle,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { getBrowserClient } from '#/lib/supabase-browser'

export const Route = createFileRoute('/arsiparis/verifikasi-penyusutan')({ component: VerifikasiPenyusutanPage })

type VerifikasiItem = {
  arsip_id: string
  verifikasi_id: string
  nomor_surat: string
  judul_dokumen: string
  verifikasi_status: 'MENUNGGU' | 'DISETUJUI' | 'DITOLAK'
  dipindahkan_oleh: string
  created_at: string
  decided_by: string | null
  decided_at: string | null
  catatan: string | null
}

function VerifikasiPenyusutanPage() {
  const [items, setItems] = useState<VerifikasiItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fungsiList, setFungsiList] = useState<{ id: string; nama: string }[]>([])
  const [fungsiFilter, setFungsiFilter] = useState('')

  // Modal state
  const [setujuOpen, setSetujuOpen] = useState(false)
  const [tolakOpen, setTolakOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<VerifikasiItem | null>(null)
  const [catatan, setCatatan] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

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
      const res = await fetch(`/api/arsiparis/verifikasi-penyusutan?${params}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Gagal'); setLoading(false); return }
      setItems(json.verifikasi ?? [])
    } catch { setError('Terjadi kesalahan') } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [fungsiFilter])

  function formatDate(str: string) {
    try { return new Date(str).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return str }
  }

  function openSetuju(item: VerifikasiItem) {
    setSelectedItem(item); setCatatan(''); setActionError(null); setSetujuOpen(true)
  }

  function openTolak(item: VerifikasiItem) {
    setSelectedItem(item); setCatatan(''); setActionError(null); setTolakOpen(true)
  }

  async function handleSetuju() {
    if (!selectedItem) return
    setActionLoading(true); setActionError(null)
    try {
      const res = await fetch('/api/arsiparis/verifikasi-penyusutan/putuskan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verifikasi_id: selectedItem.verifikasi_id, aksi: 'SETUJUI', catatan: catatan.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) { setActionError(json.error ?? 'Gagal'); setActionLoading(false); return }
      setSetujuOpen(false); fetchData()
    } catch { setActionError('Terjadi kesalahan'); setActionLoading(false) }
  }

  async function handleTolak() {
    if (!selectedItem) return
    if (catatan.trim().length < 5) { setActionError('Min. 5 karakter'); return }
    setActionLoading(true); setActionError(null)
    try {
      const res = await fetch('/api/arsiparis/verifikasi-penyusutan/putuskan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verifikasi_id: selectedItem.verifikasi_id, aksi: 'TOLAK', catatan: catatan.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setActionError(json.error ?? 'Gagal'); setActionLoading(false); return }
      setTolakOpen(false); fetchData()
    } catch { setActionError('Terjadi kesalahan'); setActionLoading(false) }
  }

  const statusBadge = (status: VerifikasiItem['verifikasi_status']) => {
    if (status === 'MENUNGGU') return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">MENUNGGU</Badge>
    if (status === 'DISETUJUI') return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">DISETUJUI</Badge>
    return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">DITOLAK</Badge>
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
            <Link to="/arsiparis" className="hover:text-primary">Arsiparis</Link>
            <ChevronRight size={10} />
            <span className="text-primary">Verifikasi Penyusutan</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">Verifikasi Penyusutan</h2>
          <p className="text-on-surface-variant text-xs mt-1">{items.length} pengajuan menunggu verifikasi.</p>
        </div>

        <div className="flex gap-3">
          <select value={fungsiFilter} onChange={e => setFungsiFilter(e.target.value)} className="px-3 py-2 bg-white border border-border rounded-lg text-xs cursor-pointer">
            <option value="">Semua Fungsi</option>
            {fungsiList.map(f => <option key={f.id} value={f.id}>{f.nama}</option>)}
          </select>
          {fungsiFilter && <Button variant="ghost" size="sm" onClick={() => setFungsiFilter('')}>Reset</Button>}
        </div>

        {/* Setuju Modal */}
        {setujuOpen && selectedItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) setSetujuOpen(false) }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant/30">
                <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                <p className="font-semibold text-on-surface">Setujui Penyusutan?</p>
              </div>
              <div className="p-5 space-y-4">
                <div className="p-3 bg-surface-container-low/30 rounded-lg space-y-1">
                  <p className="text-xs font-semibold text-on-surface">{selectedItem.nomor_surat}</p>
                  <p className="text-xs text-on-surface-variant">{selectedItem.judul_dokumen}</p>
                </div>
                <p className="text-xs text-on-surface-variant">Arsip akan dipindahkan ke Daftar Arsip Inaktif.</p>
                {actionError && <p className="text-xs text-error">{actionError}</p>}
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setSetujuOpen(false)} disabled={!!actionLoading}>Batal</Button>
                  <Button className="flex-1 gap-1.5" onClick={handleSetuju} disabled={!!actionLoading}>
                    {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Setujui
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tolak Modal */}
        {tolakOpen && selectedItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) setTolakOpen(false) }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant/30">
                <AlertTriangle size={18} className="text-error shrink-0" />
                <p className="font-semibold text-on-surface">Tolak Penyusutan?</p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">Alasan Penolakan <span className="text-error">*</span></label>
                  <textarea value={catatan} onChange={e => { setCatatan(e.target.value); setActionError(null) }} rows={4}
                    placeholder="Jelaskan mengapa penyusutan ditolak..."
                    className={cn('w-full px-3 py-2 border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring resize-none', actionError ? 'border-error' : 'border-border')}
                  />
                  {actionError && <p className="text-[10px] text-error mt-1">{actionError}</p>}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setTolakOpen(false)} disabled={!!actionLoading}>Batal</Button>
                  <Button variant="destructive" className="flex-1 gap-1.5" onClick={handleTolak} disabled={!!actionLoading}>
                    {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}Tolak
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
            <div className="w-14 h-14 rounded-xl bg-blue-500/10 flex items-center justify-center"><ClipboardCheck size={24} className="text-blue-500" /></div>
            <p className="font-headline text-lg font-bold text-on-surface">Tidak ada pengajuan</p>
            <p className="text-on-surface-variant text-xs">Pengajuan verifikasi penyusutan akan muncul di sini.</p>
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
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Tanggal Diajukan</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Status</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a, i) => (
                    <tr key={a.verifikasi_id} className="border-t border-outline-variant/20 hover:bg-primary/5 transition-colors">
                      <td className="px-4 py-3 text-center text-outline">{i + 1}</td>
                      <td className="px-4 py-3 font-semibold text-on-surface">{a.nomor_surat}</td>
                      <td className="px-4 py-3 text-on-surface line-clamp-1">{a.judul_dokumen}</td>
                      <td className="px-4 py-3 text-center text-on-surface-variant">{formatDate(a.created_at)}</td>
                      <td className="px-4 py-3 text-center">{statusBadge(a.verifikasi_status)}</td>
                      <td className="px-4 py-3 text-center">
                        {a.verifikasi_status === 'MENUNGGU' ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button size="icon-xs" variant="ghost" onClick={() => openSetuju(a)} aria-label="Setujui">
                              <CheckCircle2 size={14} className="text-green-500" />
                            </Button>
                            <Button size="icon-xs" variant="ghost" onClick={() => openTolak(a)} aria-label="Tolak">
                              <X size={14} className="text-error" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-outline">Selesai</span>
                        )}
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
