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
import { apiFetch } from '#/lib/api-client'
import { ApiError, apiMutation } from '#/lib/api-mutation'
import type { DetailRow, JenisRow, KategoriRow } from '#/lib/master-data/shared'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '#/components/ui/select'

export const Route = createFileRoute('/admin/master-data/detail')({
  component: DetailPage,
})

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function DetailPage() {
  const [items, setItems] = useState<DetailRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [jenisList, setJenisList] = useState<JenisRow[]>([])
  const [kategoriList, setKategoriList] = useState<KategoriRow[]>([])
  const [filterJenis, setFilterJenis] = useState('')
  const [filterKategori, setFilterKategori] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<DetailRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DetailRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [formJenisId, setFormJenisId] = useState('')
  const [formKategoriId, setFormKategoriId] = useState('')
  const [formNama, setFormNama] = useState('')
  const [formDeskripsi, setFormDeskripsi] = useState('')

  useEffect(() => { fetchData(); fetchJenis(); fetchKategoriList() }, [])

  useEffect(() => {
    if (filterJenis) { fetchKategoriList() } else { setKategoriList([]); setFilterKategori('') }
  }, [filterJenis])

  useEffect(() => { /* filter is client-side, no refetch needed */ }, [filterJenis, filterKategori])

  async function fetchData() {
    setLoading(true)
    try {
      const data = await apiFetch<DetailRow[]>('/master-detail')
      setItems(data)
    } catch { /* silent */ } finally { setLoading(false) }
  }

  async function fetchJenis() {
    try {
      const data = await apiFetch<JenisRow[]>('/master-jenis')
      setJenisList(data)
    } catch { /* silent */ }
  }

  async function fetchKategoriList() {
    try {
      const data = await apiFetch<KategoriRow[]>('/master-kategori')
      setKategoriList(data)
    } catch { /* silent */ }
  }

  const filtered = items.filter(f =>
    (f.nama.toLowerCase().includes(search.toLowerCase()) ||
    (f.deskripsi ?? '').toLowerCase().includes(search.toLowerCase())) &&
    (!filterJenis || f.jenis_nama === jenisList.find(j => j.id === filterJenis)?.nama) &&
    (!filterKategori || f.kategori_permintaan_id === filterKategori)
  )

  function openCreate() {
    setEditing(null)
    setFormJenisId(jenisList[0]?.id ?? '')
    setFormKategoriId(kategoriList.filter(k => k.jenis_permintaan_id === jenisList[0]?.id)[0]?.id ?? '')
    setFormNama('')
    setFormDeskripsi('')
    setError('')
    setModalOpen(true)
  }
  function openEdit(item: DetailRow) {
    setEditing(item)
    const kategori = kategoriList.find(k => k.id === item.kategori_permintaan_id)
    setFormJenisId(kategori?.jenis_permintaan_id ?? '')
    setFormKategoriId(item.kategori_permintaan_id)
    setFormNama(item.nama)
    setFormDeskripsi(item.deskripsi ?? '')
    setError('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!formNama.trim()) { setError('Nama tidak boleh kosong'); return }
    if (!formKategoriId) { setError('Kategori permintaan harus dipilih'); return }
    setSaving(true)
    try {
      if (editing) {
        await apiMutation(`/master-detail/${editing.id}`, {
          method: 'PATCH',
          body: {
            kategoriPermintaanId: formKategoriId,
            nama: formNama.trim(),
            deskripsi: formDeskripsi.trim() || undefined,
          },
        })
      } else {
        await apiMutation('/master-detail', {
          method: 'POST',
          body: {
            kategoriPermintaanId: formKategoriId,
            nama: formNama.trim(),
            deskripsi: formDeskripsi.trim() || undefined,
          },
        })
      }
      setModalOpen(false)
      setSuccessMsg(editing ? 'Detail berhasil diperbarui.' : 'Detail berhasil ditambahkan.')
      setTimeout(() => setSuccessMsg(''), 3000)
      fetchData()
    } catch (err) { setError(getErrorMessage(err, 'Gagal menyimpan')) } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await apiMutation(`/master-detail/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      setSuccessMsg('Detail berhasil dihapus.')
      setTimeout(() => setSuccessMsg(''), 3000)
      fetchData()
    } catch (err) {
      alert(getErrorMessage(err, 'Gagal menghapus detail'))
    } finally { setSaving(false) }
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
              <Tag size={12} /><span>Admin / Master Data</span><ChevronRight size={10} />
              <span className="text-primary">Detail Permintaan</span>
            </div>
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Detail Permintaan</h2>
            <p className="text-on-surface-variant text-xs mt-1">Kelola detail permintaan (opsional — tidak semua kategori memiliki detail).</p>
          </div>
          <Button onClick={openCreate} size="sm" className="gap-1.5"><Plus size={14} />Tambah Detail</Button>
        </div>

        {successMsg && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-xs px-4 py-2.5 rounded-lg font-medium">
            {successMsg}
          </div>
        )}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline/40" />
            <input type="text" placeholder="Cari detail..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 w-full bg-white border border-border rounded-lg text-xs focus:ring-1 focus:ring-ring/40 outline-none placeholder:text-outline/40"
            />
          </div>
          <Select value={filterJenis} onValueChange={v => { setFilterJenis(v ?? ''); setFilterKategori(''); setSearch('') }}>
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
          <Select value={filterKategori} onValueChange={v => { setFilterKategori(v ?? ''); setSearch('') }} disabled={!filterJenis}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter Kategori...">
                {v => v ? (kategoriList.find(k => k.id === v)?.nama ?? 'Filter Kategori') : 'Filter Kategori'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Semua Kategori</SelectItem>
              {kategoriList.filter(k => !filterJenis || k.jenis_permintaan_id === filterJenis).map(k => (
                <SelectItem key={k.id} value={k.id} label={k.nama}>{k.nama}</SelectItem>
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
              <p className="font-headline text-lg font-bold text-on-surface">Belum ada detail</p>
              <p className="text-on-surface-variant text-xs mt-1">Pilih jenis dan kategori, lalu tambahkan detail.</p>
            </div>
            <Button onClick={openCreate} size="sm" variant="outline" className="gap-1.5"><Plus size={14} />Tambah Detail</Button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-container-low/30">
                  <TableHead className="w-12 text-center">No</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Kategori Induk</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Deskripsi</TableHead>
                  <TableHead className="text-center w-24">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item, i) => (
                  <TableRow key={item.id} className="group hover:bg-primary/5 transition-colors">
                    <TableCell className="text-center text-xs text-outline">{i + 1}</TableCell>
                    <TableCell><span className="font-semibold text-sm text-on-surface">{item.nama}</span></TableCell>
                    <TableCell><span className="text-xs font-medium px-2 py-0.5 bg-surface-container-low rounded">{item.kategori_nama || '—'}</span></TableCell>
                    <TableCell><span className="text-xs text-on-surface-variant">{item.jenis_nama || '—'}</span></TableCell>
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
          <DialogHeader><DialogTitle>{editing ? 'Edit Detail Permintaan' : 'Tambah Detail Permintaan Baru'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {error && <div className="bg-error/10 text-error text-xs px-3 py-2 rounded-lg font-medium">{error}</div>}
            <div className="space-y-1.5">
              <Label>Jenis Permintaan <span className="text-error">*</span></Label>
              <select value={formJenisId} onChange={e => { setFormJenisId(e.target.value); setFormKategoriId('') }}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs text-on-surface focus:ring-1 focus:ring-ring/40 outline-none">
                <option value="">Pilih jenis...</option>
                {jenisList.map(j => <option key={j.id} value={j.id}>{j.nama}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Kategori Permintaan <span className="text-error">*</span></Label>
              <select value={formKategoriId} onChange={e => setFormKategoriId(e.target.value)} disabled={!formJenisId}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs text-on-surface focus:ring-1 focus:ring-ring/40 outline-none disabled:opacity-50">
                <option value="">Pilih kategori...</option>
                {kategoriList.filter(k => !formJenisId || k.jenis_permintaan_id === formJenisId).map(k => (
                  <option key={k.id} value={k.id}>{k.nama}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dn">Nama Detail <span className="text-error">*</span></Label>
              <Input id="dn" value={formNama} onChange={e => setFormNama(e.target.value)} placeholder="Contoh: Translok Biasa" maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dd">Deskripsi</Label>
              <textarea id="dd" value={formDeskripsi} onChange={e => setFormDeskripsi(e.target.value)} placeholder="Deskripsi singkat..." rows={3} maxLength={500}
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
          <DialogHeader><DialogTitle>Hapus Detail?</DialogTitle></DialogHeader>
          <p className="text-sm text-on-surface-variant">
            Detail <strong className="text-on-surface">{deleteTarget?.nama}</strong> akan dihapus.
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
