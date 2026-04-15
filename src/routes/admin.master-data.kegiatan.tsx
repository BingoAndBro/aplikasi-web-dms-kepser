import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { DashboardShell } from '#/components/dashboard/DashboardShell'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Plus, Edit2, Trash2, Search, ClipboardList, ChevronRight } from 'lucide-react'
import { getBrowserClient } from '#/lib/supabase-browser'
import {
  getAllFungsi,
  getAllKegiatan,
  createKegiatan,
  updateKegiatan,
  deleteKegiatan,
  type FungsiRow,
  type KegiatanRow,
} from '#/lib/master-data'

export const Route = createFileRoute('/admin/master-data/kegiatan')({
  component: KegiatanPage,
})

function KegiatanPage() {
  const [items, setItems] = useState<KegiatanRow[]>([])
  const [fungsis, setFungsis] = useState<FungsiRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterFungsi, setFilterFungsi] = useState('')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<KegiatanRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<KegiatanRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [formFungsiId, setFormFungsiId] = useState('')
  const [formNama, setFormNama] = useState('')
  const [formDeskripsi, setFormDeskripsi] = useState('')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const supabase = getBrowserClient()
      if (!supabase) { setLoading(false); return }
      const [fs, ks] = await Promise.all([
        getAllFungsi(supabase),
        getAllKegiatan(supabase),
      ])
      setFungsis(fs)
      setItems(ks)
    } catch { /* silent */ } finally { setLoading(false) }
  }

  const filtered = items.filter(k => {
    const matchF = !filterFungsi || k.fungsi_id === filterFungsi
    const matchS = !search || k.nama.toLowerCase().includes(search.toLowerCase()) || (k.deskripsi ?? '').toLowerCase().includes(search.toLowerCase())
    return matchF && matchS
  })

  function openCreate() { setEditing(null); setFormFungsiId(filterFungsi || (fungsis[0]?.id ?? '')); setFormNama(''); setFormDeskripsi(''); setError(''); setModalOpen(true) }
  function openEdit(item: KegiatanRow) { setEditing(item); setFormFungsiId(item.fungsi_id); setFormNama(item.nama); setFormDeskripsi(item.deskripsi ?? ''); setError(''); setModalOpen(true) }

  async function handleSave() {
    if (!formFungsiId) { setError('Pilih fungsi'); return }
    if (!formNama.trim()) { setError('Nama tidak boleh kosong'); return }
    setSaving(true)
    try {
      const supabase = getBrowserClient()
      if (!supabase) { setError('Koneksi database tidak tersedia'); return }
      if (editing) {
        const result = await updateKegiatan(supabase, editing.id, { nama: formNama.trim(), deskripsi: formDeskripsi.trim() || undefined })
        if (result.error) { setError(result.error); return }
      } else {
        const result = await createKegiatan(supabase, { fungsiId: formFungsiId, nama: formNama.trim(), deskripsi: formDeskripsi.trim() || undefined })
        if (result.error) { setError(result.error); return }
      }
      setModalOpen(false)
      setSuccessMsg(editing ? 'Kegiatan berhasil diperbarui.' : 'Kegiatan berhasil ditambahkan.')
      setTimeout(() => setSuccessMsg(''), 3000)
      fetchData()
    } catch { setError('Gagal menyimpan') } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      const supabase = getBrowserClient()
      if (!supabase) { alert('Koneksi database tidak tersedia'); return }
      const result = await deleteKegiatan(supabase, deleteTarget.id)
      if (result.error) { alert(result.error); return }
      setDeleteTarget(null)
      setSuccessMsg('Kegiatan berhasil dihapus.')
      setTimeout(() => setSuccessMsg(''), 3000)
      fetchData()
    } finally { setSaving(false) }
  }

  return (
    <DashboardShell role="ADMIN">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
              <ClipboardList size={12} /><span>Admin / Master Data</span><ChevronRight size={10} />
              <span className="text-primary">Master Kegiatan</span>
            </div>
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Master Kegiatan</h2>
            <p className="text-on-surface-variant text-xs mt-1">Kelola jenis kegiatan per departemen/fungsi.</p>
          </div>
          <Button onClick={openCreate} size="sm" className="gap-1.5" disabled={fungsis.length === 0}>
            <Plus size={14} />Tambah Kegiatan
          </Button>
        </div>

        {successMsg && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-xs px-4 py-2.5 rounded-lg font-medium">
            {successMsg}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <select value={filterFungsi} onChange={e => setFilterFungsi(e.target.value)}
            className="bg-white border border-border rounded-lg px-3 py-2 text-xs font-medium text-on-surface focus:ring-1 focus:ring-ring/40 outline-none min-w-[160px]">
            <option value="">Semua Fungsi</option>
            {fungsis.map(f => <option key={f.id} value={f.id}>{f.nama}</option>)}
          </select>
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline/40" />
            <input type="text" placeholder="Cari kegiatan..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 w-full bg-white border border-border rounded-lg text-xs focus:ring-1 focus:ring-ring/40 outline-none placeholder:text-outline/40" />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white/5 rounded-2xl border border-white/10">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center"><ClipboardList size={24} className="text-primary" /></div>
            <div className="text-center">
              <p className="font-headline text-lg font-bold text-on-surface">Belum ada kegiatan</p>
              <p className="text-on-surface-variant text-xs mt-1">{filterFungsi ? 'Tidak ada kegiatan untuk fungsi ini.' : 'Tambahkan kegiatan pertama.'}</p>
            </div>
            {fungsis.length > 0 && <Button onClick={openCreate} size="sm" variant="outline" className="gap-1.5"><Plus size={14} />Tambah Kegiatan</Button>}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-container-low/30">
                  <TableHead className="w-12 text-center">No</TableHead>
                  <TableHead>Nama Kegiatan</TableHead>
                  <TableHead>Fungsi</TableHead>
                  <TableHead>Deskripsi</TableHead>
                  <TableHead className="text-center w-24">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item, i) => (
                  <TableRow key={item.id} className="group hover:bg-primary/5 transition-colors">
                    <TableCell className="text-center text-xs text-outline">{i + 1}</TableCell>
                    <TableCell><span className="font-semibold text-sm text-on-surface">{item.nama}</span></TableCell>
                    <TableCell><span className="text-xs font-medium px-2 py-0.5 bg-surface rounded-lg text-on-surface-variant">{item.fungsi_nama ?? '—'}</span></TableCell>
                    <TableCell><span className="text-xs text-on-surface-variant">{item.deskripsi || '—'}</span></TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon-xs" variant="ghost" onClick={() => openEdit(item)}><Edit2 size={14} /></Button>
                        <Button size="icon-xs" variant="ghost" onClick={() => setDeleteTarget(item)} className="hover:text-error"><Trash2 size={14} /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Kegiatan' : 'Tambah Kegiatan Baru'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {error && <div className="bg-error/10 text-error text-xs px-3 py-2 rounded-lg font-medium">{error}</div>}
            <div className="space-y-1.5">
              <Label>Fungsi <span className="text-error">*</span></Label>
              <select value={formFungsiId} onChange={e => setFormFungsiId(e.target.value)}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-ring/40">
                <option value="">Pilih Fungsi</option>
                {fungsis.map(f => <option key={f.id} value={f.id}>{f.nama}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kn">Nama Kegiatan <span className="text-error">*</span></Label>
              <Input id="kn" value={formNama} onChange={e => setFormNama(e.target.value)} placeholder="Contoh: SAKERNAS" maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kd">Deskripsi</Label>
              <textarea id="kd" value={formDeskripsi} onChange={e => setFormDeskripsi(e.target.value)} placeholder="Deskripsi..." rows={3} maxLength={500}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-xs outline-none focus:ring-1 focus:ring-ring/40 resize-none placeholder:text-outline/40" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button onClick={() => setModalOpen(false)} variant="outline" size="sm">Batal</Button>
            <Button onClick={handleSave} disabled={saving} size="sm">{saving ? 'Menyimpan...' : editing ? 'Simpan' : 'Tambah'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Hapus Kegiatan?</DialogTitle></DialogHeader>
          <p className="text-sm text-on-surface-variant">
            Kegiatan <strong className="text-on-surface">{deleteTarget?.nama}</strong> akan dihapus dari daftar kegiatan.
          </p>
          <DialogFooter className="gap-2">
            <Button onClick={() => setDeleteTarget(null)} variant="outline" size="sm">Batal</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving} size="sm">{saving ? 'Menghapus...' : 'Hapus'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
