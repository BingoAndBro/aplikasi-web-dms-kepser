import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { DashboardShell } from '#/components/dashboard/DashboardShell'
import { Button } from '#/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { FileCheck, ChevronRight, Plus, Edit2, Trash2, CheckCircle2, Circle } from 'lucide-react'
import { getBrowserClient } from '#/lib/supabase-browser'
import {
  getAllFungsi,
  getKegiatanByFungsi,
  getKelengkapanByKegiatanWithInfo,
  createKelengkapan,
  updateKelengkapan,
  deleteKelengkapan,
  type FungsiRow,
  type KegiatanRow,
  type KelengkapanRow,
} from '#/lib/master-data'

export const Route = createFileRoute('/admin/master-data/kelengkapan')({
  component: KelengkapanPage,
})

function KelengkapanPage() {
  const [fungsis, setFungsis] = useState<FungsiRow[]>([])
  const [kegiatans, setKegiatans] = useState<KegiatanRow[]>([])
  const [items, setItems] = useState<KelengkapanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterFungsi, setFilterFungsi] = useState('')
  const [filterKegiatan, setFilterKegiatan] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<KelengkapanRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<KelengkapanRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [formIsKetuaTim, setFormIsKetuaTim] = useState(false)
  const [formNamaDokumen, setFormNamaDokumen] = useState('')
  const [formRequired, setFormRequired] = useState(true)

  useEffect(() => { fetchFungsis() }, [])

  useEffect(() => {
    if (filterFungsi) { fetchKegiatans(filterFungsi) } else { setKegiatans([]); setFilterKegiatan(''); setItems([]) }
  }, [filterFungsi])

  useEffect(() => {
    if (filterKegiatan) fetchKelengkapan(filterKegiatan)
    else setItems([])
  }, [filterKegiatan])

  async function fetchFungsis() {
    const supabase = getBrowserClient()
    if (!supabase) { setLoading(false); return }
    const data = await getAllFungsi(supabase)
    setFungsis(data)
    setLoading(false)
  }

  async function fetchKegiatans(fungsiId: string) {
    const supabase = getBrowserClient()
    if (!supabase) return
    const data = await getKegiatanByFungsi(supabase, fungsiId)
    setKegiatans(data)
    setFilterKegiatan(''); setItems([])
  }

  async function fetchKelengkapan(kegiatanId: string) {
    const supabase = getBrowserClient()
    if (!supabase) return
    const data = await getKelengkapanByKegiatanWithInfo(supabase, kegiatanId)
    setItems(data)
  }

  const filteredByRole = (isKetuaTim: boolean) => items.filter(k => k.is_ketua_tim === isKetuaTim)

  function openCreate(isKetuaTim: boolean) { setEditing(null); setFormIsKetuaTim(isKetuaTim); setFormNamaDokumen(''); setFormRequired(true); setError(''); setModalOpen(true) }
  function openEdit(item: KelengkapanRow) { setEditing(item); setFormIsKetuaTim(item.is_ketua_tim); setFormNamaDokumen(item.nama_dokumen); setFormRequired(item.required); setError(''); setModalOpen(true) }

  async function handleSave() {
    if (!formNamaDokumen.trim()) { setError('Nama dokumen tidak boleh kosong'); return }
    setSaving(true)
    try {
      const supabase = getBrowserClient()
      if (!supabase) { setError('Koneksi database tidak tersedia'); return }
      if (editing) {
        const result = await updateKelengkapan(supabase, editing.id, { namaDokumen: formNamaDokumen.trim(), required: formRequired })
        if (result.error) { setError(result.error); return }
      } else {
        const result = await createKelengkapan(supabase, { kegiatanId: filterKegiatan, isKetuaTim: formIsKetuaTim, namaDokumen: formNamaDokumen.trim(), required: formRequired })
        if (result.error) { setError(result.error); return }
      }
      setModalOpen(false)
      setSuccessMsg(editing ? 'Item kelengkapan berhasil diperbarui.' : 'Item kelengkapan berhasil ditambahkan.')
      setTimeout(() => setSuccessMsg(''), 3000)
      fetchKelengkapan(filterKegiatan)
    } catch { setError('Gagal menyimpan') } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      const supabase = getBrowserClient()
      if (!supabase) { alert('Koneksi database tidak tersedia'); return }
      const result = await deleteKelengkapan(supabase, deleteTarget.id)
      if (result.error) { alert(result.error); return }
      setDeleteTarget(null)
      setSuccessMsg('Item kelengkapan berhasil dihapus.')
      setTimeout(() => setSuccessMsg(''), 3000)
      fetchKelengkapan(filterKegiatan)
    } finally { setSaving(false) }
  }

  return (
    <DashboardShell role="ADMIN">
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
            <FileCheck size={12} /><span>Admin / Master Data</span><ChevronRight size={10} />
            <span className="text-primary">Kelengkapan Dokumen</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">Kelengkapan Dokumen</h2>
          <p className="text-on-surface-variant text-xs mt-1">Konfigurasi kelengkapan dokumen per kegiatan untuk Ketua Tim dan Anggota.</p>
        </div>

        {successMsg && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-xs px-4 py-2.5 rounded-lg font-medium">
            {successMsg}
          </div>
        )}

        <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 space-y-4">
          <h3 className="text-sm font-bold text-on-surface">Langkah 1: Pilih Kegiatan</h3>
          <div className="flex flex-wrap gap-3">
            <select value={filterFungsi} onChange={e => setFilterFungsi(e.target.value)}
              className="bg-white border border-border rounded-lg px-3 py-2 text-xs font-medium text-on-surface focus:ring-1 focus:ring-ring/40 outline-none min-w-[180px]">
              <option value="">Pilih Fungsi</option>
              {fungsis.map(f => <option key={f.id} value={f.id}>{f.nama}</option>)}
            </select>
            {filterFungsi && (
              <select value={filterKegiatan} onChange={e => setFilterKegiatan(e.target.value)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-xs font-medium text-on-surface focus:ring-1 focus:ring-ring/40 outline-none min-w-[220px]">
                <option value="">Pilih Kegiatan</option>
                {kegiatans.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </select>
            )}
          </div>
        </div>

        {filterKegiatan && (
          loading ? (
            <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <KelengkapanSection title="Kelengkapan Ketua Tim" items={filteredByRole(true)} onAdd={() => openCreate(true)} onEdit={openEdit} onDelete={setDeleteTarget} />
              <KelengkapanSection title="Kelengkapan Anggota" items={filteredByRole(false)} onAdd={() => openCreate(false)} onEdit={openEdit} onDelete={setDeleteTarget} />
            </div>
          )
        )}

        {!filterFungsi && !loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center"><FileCheck size={20} className="text-primary" /></div>
            <p className="text-sm text-on-surface-variant text-center">Pilih fungsi dan kegiatan untuk mengkonfigurasi kelengkapan dokumen.</p>
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Item Kelengkapan' : 'Tambah Item Kelengkapan'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {error && <div className="bg-error/10 text-error text-xs px-3 py-2 rounded-lg font-medium">{error}</div>}
            <div className="space-y-1.5">
              <Label htmlFor="docn">Nama Dokumen <span className="text-error">*</span></Label>
              <Input id="docn" value={formNamaDokumen} onChange={e => setFormNamaDokumen(e.target.value)} placeholder="Contoh: Laporan Pertanggungjawaban" maxLength={255} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formRequired} onChange={e => setFormRequired(e.target.checked)} className="w-4 h-4 accent-primary" />
              <span className="text-xs font-medium text-on-surface">Wajib (Required)</span>
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button onClick={() => setModalOpen(false)} variant="outline" size="sm">Batal</Button>
            <Button onClick={handleSave} disabled={saving} size="sm">{saving ? 'Menyimpan...' : editing ? 'Simpan' : 'Tambah'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Hapus Item Kelengkapan?</DialogTitle></DialogHeader>
          <p className="text-sm text-on-surface-variant">Dokumen <strong className="text-on-surface">{deleteTarget?.nama_dokumen}</strong> akan dihapus dari kelengkapan.</p>
          <DialogFooter className="gap-2">
            <Button onClick={() => setDeleteTarget(null)} variant="outline" size="sm">Batal</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving} size="sm">{saving ? 'Menghapus...' : 'Hapus'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}

function KelengkapanSection({ title, items, onAdd, onEdit, onDelete }: {
  title: string; items: KelengkapanRow[]; onAdd: () => void; onEdit: (item: KelengkapanRow) => void; onDelete: (item: KelengkapanRow) => void
}) {
  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <h3 className="text-sm font-bold text-on-surface">{title}</h3>
        <Button onClick={onAdd} size="xs" variant="outline" className="gap-1"><Plus size={12} />Tambah</Button>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 px-6">
          <p className="text-xs text-outline text-center">Belum ada kelengkapan.</p>
          <Button onClick={onAdd} size="xs" variant="ghost" className="gap-1"><Plus size={12} />Tambah item pertama</Button>
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-6 py-3 group hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {item.required ? <CheckCircle2 size={14} className="text-primary shrink-0" /> : <Circle size={14} className="text-outline shrink-0" />}
                <span className="text-xs font-medium text-on-surface truncate">{item.nama_dokumen}</span>
                {item.required && <span className="text-[9px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded uppercase shrink-0">WAJIB</span>}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Button size="icon-xs" variant="ghost" onClick={() => onEdit(item)}><Edit2 size={12} /></Button>
                <Button size="icon-xs" variant="ghost" onClick={() => onDelete(item)} className="hover:text-error"><Trash2 size={12} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
