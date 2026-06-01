import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AdminPageHeader, AdminSearchPanel, AdminTableShell } from '#/components/admin/AdminPagePrimitives'
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
import { EmptyState } from '#/components/ui/EmptyState'
import { LoadingState } from '#/components/ui/LoadingState'
import {
  Plus,
  Edit2,
  Trash2,
  Tag,
} from 'lucide-react'
import { apiFetch } from '#/lib/api-client'
import { ApiError, apiMutation } from '#/lib/api-mutation'
import type { DetailRow, KategoriRow, JenisRow } from '#/lib/master-data/shared'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '#/components/ui/select'

export const Route = createFileRoute('/admin/master-data/kategori')({
  component: KategoriPage,
})

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

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
      const [kategoris, details] = await Promise.all([
        apiFetch<KategoriRow[]>('/master-kategori'),
        apiFetch<DetailRow[]>('/master-detail'),
      ])
      const counts = new Map<string, number>()
      for (const detail of details) {
        counts.set(detail.kategori_permintaan_id, (counts.get(detail.kategori_permintaan_id) ?? 0) + 1)
      }
      setItems(kategoris.map(kategori => ({
        ...kategori,
        jumlah_detail: counts.get(kategori.id) ?? 0,
      })))
    } catch { /* silent */ } finally { setLoading(false) }
  }

  async function fetchJenis() {
    try {
      const data = await apiFetch<JenisRow[]>('/master-jenis')
      setJenisList(data)
    } catch { /* silent */ }
  }

  const filtered = items.filter(f =>
    (f.nama.toLowerCase().includes(search.toLowerCase()) ||
    (f.deskripsi ?? '').toLowerCase().includes(search.toLowerCase())) &&
    (!filterJenis || f.jenis_permintaan_id === filterJenis)
  )

  function openCreate() {
    setEditing(null)
    setFormJenisId(filterJenis || (jenisList[0]?.id ?? ''))
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
      if (editing) {
        await apiMutation(`/master-kategori/${editing.id}`, {
          method: 'PATCH',
          body: {
            jenisPermintaanId: formJenisId,
            nama: formNama.trim(),
            deskripsi: formDeskripsi.trim() || undefined,
          },
        })
      } else {
        await apiMutation('/master-kategori', {
          method: 'POST',
          body: {
            jenisPermintaanId: formJenisId,
            nama: formNama.trim(),
            deskripsi: formDeskripsi.trim() || undefined,
          },
        })
      }
      setModalOpen(false)
      setSuccessMsg(editing ? 'Kategori berhasil diperbarui.' : 'Kategori berhasil ditambahkan.')
      setTimeout(() => setSuccessMsg(''), 3000)
      fetchData()
    } catch (err) { setError(getErrorMessage(err, 'Gagal menyimpan')) } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await apiMutation(`/master-kategori/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      setSuccessMsg('Kategori berhasil dihapus.')
      setTimeout(() => setSuccessMsg(''), 3000)
      fetchData()
    } catch (err) {
      alert(getErrorMessage(err, 'Gagal menghapus kategori'))
    } finally { setSaving(false) }
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <AdminPageHeader
          eyebrow={<><Tag size={12} /><span>Admin Sistem</span><span>/</span><span>Master Data</span></>}
          title="Kategori Permintaan"
          description="Kelola kategori permintaan sebagai turunan dari Jenis Permintaan."
          actions={<Button onClick={openCreate} size="sm" className="gap-1.5" disabled={jenisList.length === 0}><Plus size={14} />Tambah Kategori</Button>}
        />

        {successMsg && (
          <div className="bg-green-50 border border-green-300 text-green-700 text-xs px-4 py-2.5 rounded-lg font-medium">
            {successMsg}
          </div>
        )}
        <AdminSearchPanel id="kategori-search" label="Cari kategori permintaan" value={search} onChange={setSearch} placeholder="Cari kategori..." resultText={`${filtered.length} dari ${items.length} kategori`}>
          <select value={filterJenis} onChange={e => setFilterJenis(e.target.value)} aria-label="Filter kategori berdasarkan jenis permintaan"
            className="h-10 min-w-[160px] rounded-xl border border-orange-100 bg-[#FFFDF9] px-3 text-xs font-bold text-zinc-800 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70">
            <option value="">Semua Jenis</option>
            {jenisList.map(j => <option key={j.id} value={j.id}>{j.nama}</option>)}
          </select>
        </AdminSearchPanel>

        {loading ? (
          <LoadingState variant="list" label="Memuat kategori permintaan" />
        ) : filtered.length === 0 ? (
          <EmptyState title="Belum ada kategori" description="Pilih jenis dan tambahkan kategori pertama." icon={<Tag size={18} />} action={jenisList.length > 0 && <Button onClick={openCreate} size="sm" variant="outline" className="gap-1.5"><Plus size={14} />Tambah Kategori</Button>} />
        ) : (
          <AdminTableShell>
            <Table>
              <TableHeader>
                <TableRow className="bg-orange-50/70">
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
                      <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <Button size="icon-xs" variant="ghost" onClick={() => openEdit(item)} aria-label={`Edit kategori ${item.nama}`}><Edit2 size={14} /></Button>
                        <Button size="icon-xs" variant="ghost" onClick={() => setDeleteTarget(item)} className="hover:text-error" aria-label={`Hapus kategori ${item.nama}`}><Trash2 size={14} /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTableShell>
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
