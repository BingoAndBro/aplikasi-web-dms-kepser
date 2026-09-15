import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  AdminActionButtons,
  adminContentCompactClassName,
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
import { useAppToast } from '#/components/ui/AppToast'
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
  Tag,
} from 'lucide-react'
import { apiFetch } from '#/lib/api-client'
import { ApiError, apiMutation } from '#/lib/api-mutation'

type JenisDokumenRow = {
  id: string
  nama: string
  deskripsi: string | null
  is_active: boolean
  created_at: string
  updated_at?: string
}

export const Route = createFileRoute('/admin/master-data/jenis-dokumen')({
  component: JenisDokumenPage,
})

function JenisDokumenPage() {
  const { showToast } = useAppToast()
  const [items, setItems] = useState<JenisDokumenRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<JenisDokumenRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JenisDokumenRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formNama, setFormNama] = useState('')
  const [formDeskripsi, setFormDeskripsi] = useState('')
  const [unsavedConfirmOpen, setUnsavedConfirmOpen] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const data = await apiFetch<JenisDokumenRow[]>('/master-jenis-dokumen')
      setItems(data)
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
  function openEdit(item: JenisDokumenRow) { setEditing(item); setFormNama(item.nama); setFormDeskripsi(item.deskripsi ?? ''); setError(''); setModalOpen(true) }
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
      const payload = { nama: formNama.trim(), deskripsi: formDeskripsi.trim() || null }
      if (editing) {
        await apiMutation<JenisDokumenRow>(`/master-jenis-dokumen/${editing.id}`, {
          method: 'PATCH',
          body: payload,
        })
      } else {
        await apiMutation<JenisDokumenRow>('/master-jenis-dokumen', {
          body: payload,
        })
      }
      setModalOpen(false)
      showToast({
        title: 'Berhasil',
        description: editing ? 'Jenis dokumen berhasil diperbarui.' : 'Jenis dokumen berhasil ditambahkan.',
        variant: 'success',
      })
      fetchData()
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Gagal menyimpan'
      setError(message)
      showToast({ title: 'Gagal', description: message, variant: 'error' })
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await apiMutation(`/master-jenis-dokumen/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      setDeleteTarget(null)
      showToast({
        title: 'Berhasil',
        description: 'Jenis dokumen berhasil dihapus.',
        variant: 'success',
      })
      fetchData()
    } catch (err) {
      showToast({
        title: 'Gagal',
        description: err instanceof ApiError ? err.message : 'Gagal menghapus jenis dokumen',
        variant: 'error',
      })
    } finally { setSaving(false) }
  }

  return (
    <PageLayout>
      <div className={adminPageContainerClassName}>
        <AdminPageHeader
          className={adminContentCompactClassName}
          icon={<Tag />}
          eyebrow={<><span>Admin Sistem</span><span>/</span><span>Master Data</span></>}
          title="Jenis Dokumen"
          description="Kelola jenis dokumen untuk dokumen Non-Material seperti Rapat, Kunjungan, dan Pelatihan."
          actions={<Button onClick={openCreate} className={adminPrimaryActionClassName + ' gap-2'}><Plus />Tambah Jenis</Button>}
        />

        <AdminSearchPanel className={adminContentCompactClassName} id="jenis-dokumen-search" label="Cari jenis dokumen" value={search} onChange={setSearch} placeholder="Cari jenis..." resultText={`Total ${filtered.length} Jenis`} />

        {loading ? (
          <LoadingState variant="list" label="Memuat jenis dokumen" />
        ) : filtered.length === 0 ? (
          <EmptyState title="Belum ada jenis dokumen" description="Tambahkan jenis dokumen pertama untuk dokumen Non-Material." icon={<Tag size={18} />} action={<Button onClick={openCreate} size="sm" variant="outline" className="gap-1.5"><Plus size={14} />Tambah Jenis</Button>} />
        ) : (
          <AdminTableShell className={adminContentCompactClassName}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">No</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Deskripsi</TableHead>
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
                      <AdminActionButtons
                        onEdit={() => openEdit(item)}
                        onDelete={() => setDeleteTarget(item)}
                        editLabel={`Edit jenis dokumen ${item.nama}`}
                        deleteLabel={`Hapus jenis dokumen ${item.nama}`}
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
          <DialogHeader className={adminDialogHeaderClassName}><DialogTitle>{editing ? 'Edit Jenis Dokumen' : 'Tambah Jenis Dokumen Baru'}</DialogTitle></DialogHeader>
          <div className={adminDialogBodyClassName}>
            {error && <div className="bg-error/10 text-error text-xs px-3 py-2 rounded-lg font-medium">{error}</div>}
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName} htmlFor="jd-nama">Nama Jenis <span className="text-error">*</span></Label>
              <Input id="jd-nama" value={formNama} onChange={e => setFormNama(e.target.value)} placeholder="Contoh: Rapat" maxLength={255} className={adminFormFieldClassName} />
            </div>
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName} htmlFor="jd-deskripsi">Deskripsi</Label>
              <textarea id="jd-deskripsi" value={formDeskripsi} onChange={e => setFormDeskripsi(e.target.value)} placeholder="Deskripsi singkat..." rows={3} maxLength={500}
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
        title="Hapus Jenis Dokumen?"
        confirmLabel={saving ? 'Menghapus...' : 'Hapus'}
        onConfirm={handleDelete}
        loading={saving}
      >
        Jenis dokumen <strong className="text-text-strong">{deleteTarget?.nama}</strong> akan dihapus.
      </AdminConfirmationDialog>
    </PageLayout>
  )
}
