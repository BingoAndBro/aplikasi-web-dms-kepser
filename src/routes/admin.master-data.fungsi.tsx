import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { DashboardShell } from '#/components/dashboard/DashboardShell'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  Building2,
  ChevronRight,
} from 'lucide-react'
import { getBrowserClient } from '#/lib/supabase-browser'
import {
  getAllFungsi,
  createFungsi,
  updateFungsi,
  deleteFungsi,
  type FungsiRow,
} from '#/lib/master-data'


export const Route = createFileRoute('/admin/master-data/fungsi')({
  component: FungsiPage,
})

function FungsiPage() {
  const [items, setItems] = useState<FungsiRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<FungsiRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FungsiRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [formNama, setFormNama] = useState('')
  const [formDeskripsi, setFormDeskripsi] = useState('')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const supabase = getBrowserClient()
      if (!supabase) { setLoading(false); return }
      const fungsis = await getAllFungsi(supabase)
      setItems(fungsis.map(f => ({ ...f, jumlah_kegiatan: 0 })))
    } catch { /* silent */ } finally { setLoading(false) }
  }

  const filtered = items.filter(f =>
    f.nama.toLowerCase().includes(search.toLowerCase()) ||
    (f.deskripsi ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function openCreate() { setEditing(null); setFormNama(''); setFormDeskripsi(''); setError(''); setModalOpen(true) }
  function openEdit(item: FungsiRow) { setEditing(item); setFormNama(item.nama); setFormDeskripsi(item.deskripsi ?? ''); setError(''); setModalOpen(true) }

  async function handleSave() {
    if (!formNama.trim()) { setError('Nama tidak boleh kosong'); return }
    setSaving(true)
    try {
      const supabase = getBrowserClient()
      if (!supabase) { setError('Koneksi database tidak tersedia'); return }
      if (editing) {
        const result = await updateFungsi(supabase, editing.id, { nama: formNama.trim(), deskripsi: formDeskripsi.trim() || undefined })
        if (result.error) { setError(result.error); return }
      } else {
        const result = await createFungsi(supabase, { nama: formNama.trim(), deskripsi: formDeskripsi.trim() || undefined })
        if (result.error) { setError(result.error); return }
      }
      setModalOpen(false)
      setSuccessMsg(editing ? 'Fungsi berhasil diperbarui.' : 'Fungsi berhasil ditambahkan.')
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
      const result = await deleteFungsi(supabase, deleteTarget.id)
      if (result.error) { alert(result.error); return }
      setDeleteTarget(null)
      setSuccessMsg('Fungsi berhasil dihapus.')
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
              <Building2 size={12} /><span>Admin / Master Data</span><ChevronRight size={10} />
              <span className="text-primary">Departemen Fungsi</span>
            </div>
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Departemen Fungsi</h2>
            <p className="text-on-surface-variant text-xs mt-1">Kelola departemen/fungsi BPS Kabupaten Kepulauan Seribu.</p>
          </div>
          <Button onClick={openCreate} size="sm" className="gap-1.5"><Plus size={14} />Tambah Fungsi</Button>
        </div>

        {successMsg && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-xs px-4 py-2.5 rounded-lg font-medium">
            {successMsg}
          </div>
        )}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline/40" />
            <input type="text" placeholder="Cari fungsi..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 w-full bg-white border border-border rounded-lg text-xs focus:ring-1 focus:ring-ring/40 outline-none placeholder:text-outline/40"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white/5 rounded-2xl border border-white/10">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center"><Building2 size={24} className="text-primary" /></div>
            <div className="text-center">
              <p className="font-headline text-lg font-bold text-on-surface">Belum ada fungsi</p>
              <p className="text-on-surface-variant text-xs mt-1">Tambahkan fungsi pertama untuk memulai.</p>
            </div>
            <Button onClick={openCreate} size="sm" variant="outline" className="gap-1.5"><Plus size={14} />Tambah Fungsi</Button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-container-low/30">
                  <TableHead className="w-12 text-center">No</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Deskripsi</TableHead>
                  <TableHead className="text-center">Jumlah Kegiatan</TableHead>
                  <TableHead className="text-center w-24">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item, i) => (
                  <TableRow key={item.id} className="group hover:bg-primary/5 transition-colors">
                    <TableCell className="text-center text-xs text-outline">{i + 1}</TableCell>
                    <TableCell><span className="font-semibold text-sm text-on-surface">{item.nama}</span></TableCell>
                    <TableCell><span className="text-xs text-on-surface-variant">{item.deskripsi || '—'}</span></TableCell>
                    <TableCell className="text-center">
                      <span className="text-xs font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-lg">{item.jumlah_kegiatan ?? 0}</span>
                    </TableCell>
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
          <DialogHeader><DialogTitle>{editing ? 'Edit Fungsi' : 'Tambah Fungsi Baru'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {error && <div className="bg-error/10 text-error text-xs px-3 py-2 rounded-lg font-medium">{error}</div>}
            <div className="space-y-1.5">
              <Label htmlFor="fn">Nama Fungsi <span className="text-error">*</span></Label>
              <Input id="fn" value={formNama} onChange={e => setFormNama(e.target.value)} placeholder="Contoh: Sosial" maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fd">Deskripsi</Label>
              <textarea id="fd" value={formDeskripsi} onChange={e => setFormDeskripsi(e.target.value)} placeholder="Deskripsi singkat..." rows={3} maxLength={500}
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
          <DialogHeader><DialogTitle>Hapus Fungsi?</DialogTitle></DialogHeader>
          <p className="text-sm text-on-surface-variant">
            Fungsi <strong className="text-on-surface">{deleteTarget?.nama}</strong> akan dihapus dari daftar fungsi.
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
