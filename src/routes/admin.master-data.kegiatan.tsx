import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  AdminPageHeader,
  AdminSearchPanel,
  AdminTableShell,
} from '#/components/admin/AdminPagePrimitives'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { EmptyState } from '#/components/ui/EmptyState'
import { LoadingState } from '#/components/ui/LoadingState'
import { Plus, Edit2, Trash2, ClipboardList } from 'lucide-react'
import { apiFetch } from '#/lib/api-client'
import { ApiError, apiMutation } from '#/lib/api-mutation'
import type { FungsiRow, KegiatanRow } from '#/lib/master-data/shared'

export const Route = createFileRoute('/admin/master-data/kegiatan')({
  component: KegiatanPage,
})

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

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
      const [fs, ks] = await Promise.all([
        apiFetch<FungsiRow[]>('/master-fungsi'),
        apiFetch<KegiatanRow[]>('/master-kegiatan'),
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
      if (editing) {
        await apiMutation(`/master-kegiatan/${editing.id}`, {
          method: 'PATCH',
          body: {
            fungsiId: formFungsiId,
            nama: formNama.trim(),
            deskripsi: formDeskripsi.trim() || undefined,
          },
        })
      } else {
        await apiMutation('/master-kegiatan', {
          method: 'POST',
          body: { fungsiId: formFungsiId, nama: formNama.trim(), deskripsi: formDeskripsi.trim() || undefined },
        })
      }
      setModalOpen(false)
      setSuccessMsg(editing ? 'Kegiatan berhasil diperbarui.' : 'Kegiatan berhasil ditambahkan.')
      setTimeout(() => setSuccessMsg(''), 3000)
      fetchData()
    } catch (err) { setError(getErrorMessage(err, 'Gagal menyimpan')) } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await apiMutation(`/master-kegiatan/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      setSuccessMsg('Kegiatan berhasil dihapus.')
      setTimeout(() => setSuccessMsg(''), 3000)
      fetchData()
    } catch (err) {
      alert(getErrorMessage(err, 'Gagal menghapus kegiatan'))
    } finally { setSaving(false) }
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <AdminPageHeader
          eyebrow={<><ClipboardList size={12} /><span>Admin Sistem</span><span>/</span><span>Master Data</span></>}
          title="Master Kegiatan"
          description="Kelola kegiatan di bawah fungsi/departemen yang menjadi dasar Ketua Tim dan konfigurasi dokumen."
          actions={<Button onClick={openCreate} size="sm" className="gap-1.5" disabled={fungsis.length === 0}><Plus size={14} />Tambah Kegiatan</Button>}
        />

        {successMsg && (
          <div className="bg-green-50 border border-green-300 text-green-700 text-xs px-4 py-2.5 rounded-lg font-medium">
            {successMsg}
          </div>
        )}

        <AdminSearchPanel
          id="kegiatan-search"
          label="Cari kegiatan"
          value={search}
          onChange={setSearch}
          placeholder="Cari kegiatan..."
          resultText={`${filtered.length} dari ${items.length} kegiatan`}
        >
          <select value={filterFungsi} onChange={e => setFilterFungsi(e.target.value)} aria-label="Filter kegiatan berdasarkan fungsi"
            className="h-10 rounded-xl border border-orange-100 bg-[#FFFDF9] px-3 text-xs font-bold text-zinc-800 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70">
            <option value="">Semua Fungsi</option>
            {fungsis.map(f => <option key={f.id} value={f.id}>{f.nama}</option>)}
          </select>
        </AdminSearchPanel>

        {loading ? (
          <LoadingState variant="list" label="Memuat kegiatan" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Belum ada kegiatan"
            description={filterFungsi ? 'Tidak ada kegiatan untuk fungsi ini.' : 'Tambahkan kegiatan pertama.'}
            icon={<ClipboardList size={18} />}
            action={fungsis.length > 0 && <Button onClick={openCreate} size="sm" variant="outline" className="gap-1.5"><Plus size={14} />Tambah Kegiatan</Button>}
          />
        ) : (
          <AdminTableShell>
            <Table>
              <TableHeader>
                <TableRow className="bg-orange-50/70">
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
                      <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <Button size="icon-xs" variant="ghost" onClick={() => openEdit(item)} aria-label={`Edit kegiatan ${item.nama}`}><Edit2 size={14} /></Button>
                        <Button size="icon-xs" variant="ghost" onClick={() => setDeleteTarget(item)} className="hover:text-error" aria-label={`Hapus kegiatan ${item.nama}`}><Trash2 size={14} /></Button>
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
          <DialogHeader><DialogTitle>{editing ? 'Edit Kegiatan' : 'Tambah Kegiatan Baru'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {error && <div className="bg-error/10 text-error text-xs px-3 py-2 rounded-lg font-medium">{error}</div>}
            <div className="space-y-1.5">
              <Label>Fungsi <span className="text-error">*</span></Label>
              <select value={formFungsiId} onChange={e => setFormFungsiId(e.target.value)} aria-label="Pilih fungsi untuk kegiatan"
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
    </PageLayout>
  )
}
