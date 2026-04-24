import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
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
  Tag,
  ChevronRight,
} from 'lucide-react'
import { getBrowserClient } from '#/lib/supabase-browser'
import {
  getAllKategoriWithCount,
  getAllJenis,
  createKategori,
  updateKategori,
  deleteKategori,
  type KategoriRow,
  type JenisRow,
} from '#/lib/master-data'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '#/components/ui/select'

export const Route = createFileRoute('/admin/master-data/kategori')({
  component: KategoriPage,
})

function KategoriPage() {
  const [items, setItems] = useState<KategoriRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [jenisList, setJenisList] = useState<JenisRow[]>([])
  const [filterJenis, setFilterJenis] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<KategoriRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<KategoriRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [formJenisId, setFormJenisId] = useState('')
  const [formNama, setFormNama] = useState('')
  const [formDeskripsi, setFormDeskripsi] = useState('')

  useEffect(() => { fetchData(); fetchJenis() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const supabase = getBrowserClient()
      if (!supabase) { setLoading(false); return }
      const data = await getAllKategoriWithCount(supabase)
      setItems(data)
    } catch { /* silent */ } finally { setLoading(false) }
  }

  async function fetchJenis() {
    const supabase = getBrowserClient()
    if (!supabase) return
    const data = await getAllJenis(supabase)
    setJenisList(data)
  }

  const filtered = items.filter(f =>
    (f.nama.toLowerCase().includes(search.toLowerCase()) ||
    (f.deskripsi ?? '').toLowerCase().includes(search.toLowerCase())) &&
    (!filterJenis || f.jenis_permintaan_id === filterJenis)
  )

  function openCreate() {
    setEditing(null)
    setFormJenisId(jenisList[0]?.id ?? '')
    setFormNama('')
    setFormDeskripsi('')
    setError('')
    setModalOpen(true)
  }
  function openEdit(item: KategoriRow) {
    setEditing(item)
    setFormJenisId(item.jenis_permintaan_id)
    setFormNama(item.nama)
    setFormDeskripsi(item.deskripsi ?? '')
    setError('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!formNama.trim()) { setError('Nama tidak boleh kosong'); return }
    if (!formJenisId) { setError('Jenis permintaan harus dipilih'); return }
    setSaving(true)
    try {
      const supabase = getBrowserClient()
      if (!supabase) { setError('Koneksi database tidak tersedia'); return }
      if (editing) {
        const result = await updateKategori(supabase, editing.id, {
          jenisPermintaanId: formJenisId,
          nama: formNama.trim(),
          deskripsi: formDeskripsi.trim() || undefined,
        })
        if (result.error) { setError(result.error); return }
      } else {
        const result = await createKategori(supabase, {
          jenisPermintaanId: formJenisId,
          nama: formNama.trim(),
          deskripsi: formDeskripsi.trim() || undefined,
        })
        if (result.error) { setError(result.error); return }
      }
      setModalOpen(false)
      setSuccessMsg(editing ? 'Kategori berhasil diperbarui.' : 'Kategori berhasil ditambahkan.')
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
      const result = await deleteKategori(supabase, deleteTarget.id)
      if (result.error) { alert(result.error); return }
      setDeleteTarget(null)
      setSuccessMsg('Kategori berhasil dihapus.')
      setTimeout(() => setSuccessMsg(''), 3000)
      fetchData()
    } finally { setSaving(false) }
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
              <Tag size={12} /><span>Admin / Master Data</span><ChevronRight size={10} />
              <span className="text-primary">Kategori Permintaan</span>
            </div>
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Kategori Permintaan</h2>
            <p className="text-on-surface-variant text-xs mt-1">Kelola kategori permintaan yang bergantung pada jenis permintaan.</p>
          </div>
          <Button onClick={openCreate} size="sm" className="gap-1.5"><Plus size={14} />Tambah Kategori</Button>
        </div>

        {successMsg && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-xs px-4 py-2.5 rounded-lg font-medium">
            {successMsg}
          </div>
        )}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline/40" />
            <input type="text" placeholder="Cari kategori..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 w-full bg-white border border-border rounded-lg text-xs focus:ring-1 focus:ring-ring/40 outline-none placeholder:text-outline/40"
            />
          </div>
          <Select value={filterJenis} onValueChange={v => { setFilterJenis(v ?? ''); setSearch('') }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter Jenis...">
                {v => v ? (jenisList.find(j => j.id === v)?.nama ?? 'Filter Jenis') : 'Filter Jenis'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Semua Jenis</SelectItem>
              {jenisList.map(j => (
                <SelectItem key={j.id} value={j.id} label={j.nama}>{j.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white/5 rounded-2xl border border-white/10">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center"><Tag size={24} className="text-primary" /></div>
            <div className="text-center">
              <p className="font-headline text-lg font-bold text-on-surface">Belum ada kategori</p>
              <p className="text-on-surface-variant text-xs mt-1">Pilih jenis dan tambahkan kategori pertama.</p>
            </div>
            <Button onClick={openCreate} size="sm" variant="outline" className="gap-1.5"><Plus size={14} />Tambah Kategori</Button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-container-low/30">
                  <TableHead className="w-12 text-center">No</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Jenis Induk</TableHead>
                  <TableHead>Deskripsi</TableHead>
                  <TableHead className="text-center">Jumlah Detail</TableHead>
                  <TableHead className="text-center w-24">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item, i) => (
                  <TableRow key={item.id} className="group hover:bg-primary/5 transition-colors">
                    <TableCell className="text-center text-xs text-outline">{i + 1}</TableCell>
                    <TableCell><span className="font-semibold text-sm text-on-surface">{item.nama}</span></TableCell>
                    <TableCell><span className="text-xs font-medium px-2 py-0.5 bg-surface-container-low rounded">{item.jenis_nama || '—'}</span></TableCell>
                    <TableCell><span className="text-xs text-on-surface-variant">{item.deskripsi || '—'}</span></TableCell>
                    <TableCell className="text-center">
                      <span className="text-xs font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-lg">{item.jumlah_detail ?? 0}</span>
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
          <DialogHeader><DialogTitle>{editing ? 'Edit Kategori Permintaan' : 'Tambah Kategori Permintaan Baru'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {error && <div className="bg-error/10 text-error text-xs px-3 py-2 rounded-lg font-medium">{error}</div>}
            <div className="space-y-1.5">
              <Label>Jenis Permintaan <span className="text-error">*</span></Label>
              <Select value={formJenisId} onValueChange={v => setFormJenisId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih jenis...">
                    {v => v ? (jenisList.find(j => j.id === v)?.nama ?? '') : 'Pilih jenis...'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {jenisList.map(j => (
                    <SelectItem key={j.id} value={j.id} label={j.nama}>{j.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kn">Nama Kategori <span className="text-error">*</span></Label>
              <Input id="kn" value={formNama} onChange={e => setFormNama(e.target.value)} placeholder="Contoh: Translok" maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kd">Deskripsi</Label>
              <textarea id="kd" value={formDeskripsi} onChange={e => setFormDeskripsi(e.target.value)} placeholder="Deskripsi singkat..." rows={3} maxLength={500}
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
          <DialogHeader><DialogTitle>Hapus Kategori?</DialogTitle></DialogHeader>
          <p className="text-sm text-on-surface-variant">
            Kategori <strong className="text-on-surface">{deleteTarget?.nama}</strong> akan dihapus.
          </p>
          <DialogFooter className="gap-2">
            <Button onClick={() => setDeleteTarget(null)} variant="outline" size="sm">Batal</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving} size="sm">{saving ? 'Menghapus...' : 'Hapus'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
