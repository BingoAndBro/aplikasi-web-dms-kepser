import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  adminContentCompactClassName,
  AdminActionButtons,
  AdminCountPill,
  adminDialogBodyClassName,
  adminDialogCancelButtonClassName,
  adminDialogContentClassName,
  adminDialogFooterClassName,
  adminDialogHeaderClassName,
  adminDialogSubmitButtonClassName,
  adminFormFieldClassName,
  adminFormLabelClassName,
  adminPrimaryActionClassName,
  adminPageContainerClassName,
  adminTextareaClassName,
  adminTableBodyClassName,
  adminTableToolbarClassName,
  AdminConfirmationDialog,
  AdminPageHeader,
  AdminSearchPanel,
  AdminTableShell,
  useAdminFormLeaveGuard,
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
  const [unsavedConfirmOpen, setUnsavedConfirmOpen] = useState(false)

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
  const isModalDirty = modalOpen && !saving && (
    editing
      ? formNama !== editing.nama || formDeskripsi !== (editing.deskripsi ?? '')
      : Boolean(formNama.trim() || formDeskripsi.trim())
  )

  useAdminFormLeaveGuard(isModalDirty)

  function openCreate() { setEditing(null); setFormNama(''); setFormDeskripsi(''); setError(''); setModalOpen(true) }
  function openEdit(item: FungsiRow) { setEditing(item); setFormNama(item.nama); setFormDeskripsi(item.deskripsi ?? ''); setError(''); setModalOpen(true) }
  function closeModal() {
    setModalOpen(false)
    setUnsavedConfirmOpen(false)
  }
  function requestCloseModal() {
    if (saving) return
    if (isModalDirty) {
      setUnsavedConfirmOpen(true)
      return
    }
    closeModal()
  }

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
      <div className={adminPageContainerClassName}>
        <AdminPageHeader
          className={adminContentCompactClassName}
          icon={<Building2 />}
          eyebrow={<><span>Admin Sistem</span><span>/</span><span>Master Data</span></>}
          title="Departemen Fungsi"
          description="Kelola struktur fungsi/departemen sebagai fondasi kegiatan dan konfigurasi dokumen."
          actions={<Button onClick={openCreate} className={adminPrimaryActionClassName + ' gap-2'}><Plus />Tambah Fungsi</Button>}
        />

        {successMsg && (
          <div className={adminContentCompactClassName + ' bg-green-50 border border-green-300 text-green-700 text-xs px-4 py-2.5 rounded-lg font-medium'}>
            {successMsg}
          </div>
        )}
        <AdminSearchPanel
          className={adminContentCompactClassName + ' ' + adminTableToolbarClassName}
          id="fungsi-search"
          label="Cari fungsi"
          value={search}
          onChange={setSearch}
          placeholder="Cari fungsi..."
          resultText={`Total ${filtered.length} Fungsi`}
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
          <AdminTableShell className={adminContentCompactClassName + ' ' + adminTableBodyClassName}>
            <Table>
              <TableHeader>
                <TableRow>
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
                      <AdminCountPill count={item.jumlah_kegiatan ?? 0} label="Kegiatan" />
                    </TableCell>
                    <TableCell className="text-center">
                      <AdminActionButtons
                        onEdit={() => openEdit(item)}
                        onDelete={() => setDeleteTarget(item)}
                        editLabel={`Edit fungsi ${item.nama}`}
                        deleteLabel={`Hapus fungsi ${item.nama}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTableShell>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={open => open ? setModalOpen(true) : requestCloseModal()}>
        <DialogContent className={adminDialogContentClassName + ' sm:max-w-md'}>
          <DialogHeader className={adminDialogHeaderClassName}><DialogTitle>{editing ? 'Edit Fungsi' : 'Tambah Fungsi Baru'}</DialogTitle></DialogHeader>
          <div className={adminDialogBodyClassName}>
            {error && <div className="bg-error/10 text-error text-xs px-3 py-2 rounded-lg font-medium">{error}</div>}
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName} htmlFor="fn">Nama Fungsi <span className="text-error">*</span></Label>
              <Input id="fn" value={formNama} onChange={e => setFormNama(e.target.value)} placeholder="Contoh: Sosial" maxLength={255} className={adminFormFieldClassName} />
            </div>
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName} htmlFor="fd">Deskripsi</Label>
              <textarea id="fd" value={formDeskripsi} onChange={e => setFormDeskripsi(e.target.value)} placeholder="Deskripsi singkat..." rows={3} maxLength={500}
                className={adminTextareaClassName} />
            </div>
          </div>
          <DialogFooter className={adminDialogFooterClassName}>
            <Button onClick={requestCloseModal} variant="outline" className={adminDialogCancelButtonClassName}>Batal</Button>
            <Button onClick={handleSave} disabled={saving} className={adminDialogSubmitButtonClassName}>{saving ? 'Menyimpan...' : editing ? 'Simpan' : 'Tambah'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminConfirmationDialog
        open={unsavedConfirmOpen}
        onOpenChange={setUnsavedConfirmOpen}
        title="Keluar dari form?"
        tone="warning"
        cancelLabel="Lanjut Edit"
        confirmLabel="Ya, Keluar"
        onCancel={() => setUnsavedConfirmOpen(false)}
        onConfirm={closeModal}
      >
        Perubahan yang belum disimpan akan hilang.
      </AdminConfirmationDialog>

      <AdminConfirmationDialog
        open={!!deleteTarget}
        onOpenChange={open => !open && setDeleteTarget(null)}
        title="Hapus Fungsi?"
        confirmLabel={saving ? 'Menghapus...' : 'Hapus'}
        onConfirm={handleDelete}
        loading={saving}
      >
        Fungsi <strong className="text-[#071A3A]">{deleteTarget?.nama}</strong> akan dihapus dari daftar fungsi.
      </AdminConfirmationDialog>
    </PageLayout>
  )
}
