import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  AdminPageHeader,
  AdminSearchPanel,
  AdminTableShell,
} from '#/components/admin/AdminPagePrimitives'
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
  Building2,
} from 'lucide-react'
import { apiFetch } from '#/lib/api-client'
import { ApiError, apiMutation } from '#/lib/api-mutation'
import type { FungsiRow, KegiatanRow } from '#/lib/master-data/shared'


export const Route = createFileRoute('/admin/master-data/fungsi')({
  component: FungsiPage,
})

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

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
      const [fungsis, kegiatans] = await Promise.all([
        apiFetch<FungsiRow[]>('/master-fungsi'),
        apiFetch<KegiatanRow[]>('/master-kegiatan'),
      ])
      const counts = new Map<string, number>()
      for (const kegiatan of kegiatans) {
        counts.set(kegiatan.fungsi_id, (counts.get(kegiatan.fungsi_id) ?? 0) + 1)
      }
      setItems(fungsis.map(fungsi => ({
        ...fungsi,
        jumlah_kegiatan: counts.get(fungsi.id) ?? 0,
      })))
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
      if (editing) {
        await apiMutation(`/master-fungsi/${editing.id}`, {
          method: 'PATCH',
          body: { nama: formNama.trim(), deskripsi: formDeskripsi.trim() || undefined },
        })
      } else {
        await apiMutation('/master-fungsi', {
          method: 'POST',
          body: { nama: formNama.trim(), deskripsi: formDeskripsi.trim() || undefined },
        })
      }
      setModalOpen(false)
      setSuccessMsg(editing ? 'Fungsi berhasil diperbarui.' : 'Fungsi berhasil ditambahkan.')
      setTimeout(() => setSuccessMsg(''), 3000)
      fetchData()
    } catch (err) { setError(getErrorMessage(err, 'Gagal menyimpan')) } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await apiMutation(`/master-fungsi/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      setSuccessMsg('Fungsi berhasil dihapus.')
      setTimeout(() => setSuccessMsg(''), 3000)
      fetchData()
    } catch (err) {
      alert(getErrorMessage(err, 'Gagal menghapus fungsi'))
    } finally { setSaving(false) }
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <AdminPageHeader
          eyebrow={<><Building2 size={12} /><span>Admin Sistem</span><span>/</span><span>Master Data</span></>}
          title="Departemen Fungsi"
          description="Kelola struktur fungsi/departemen sebagai fondasi kegiatan dan konfigurasi dokumen."
          actions={<Button onClick={openCreate} size="sm" className="gap-1.5"><Plus size={14} />Tambah Fungsi</Button>}
        />

        {successMsg && (
          <div className="bg-green-50 border border-green-300 text-green-700 text-xs px-4 py-2.5 rounded-lg font-medium">
            {successMsg}
          </div>
        )}
        <AdminSearchPanel
          id="fungsi-search"
          label="Cari fungsi"
          value={search}
          onChange={setSearch}
          placeholder="Cari fungsi..."
          resultText={`${filtered.length} dari ${items.length} fungsi`}
        />

        {loading ? (
          <LoadingState variant="list" label="Memuat fungsi" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Belum ada fungsi"
            description="Tambahkan fungsi pertama untuk memulai konfigurasi master data."
            icon={<Building2 size={18} />}
            action={<Button onClick={openCreate} size="sm" variant="outline" className="gap-1.5"><Plus size={14} />Tambah Fungsi</Button>}
          />
        ) : (
          <AdminTableShell>
            <Table>
              <TableHeader>
                <TableRow className="bg-orange-50/70">
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
                      <div className="flex justify-center gap-1 transition-opacity">
                        <Button size="icon-xs" variant="ghost" onClick={() => openEdit(item)} aria-label={`Edit fungsi ${item.nama}`}><Edit2 size={14} /></Button>
                        <Button size="icon-xs" variant="ghost" onClick={() => setDeleteTarget(item)} className="hover:text-error" aria-label={`Hapus fungsi ${item.nama}`}><Trash2 size={14} /></Button>
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
    </PageLayout>
  )
}
