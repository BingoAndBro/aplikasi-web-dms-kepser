import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  AdminActionButtons,
  AdminCountPill,
  AdminFilterSelect,
  AdminFormSelect,
  AdminRelationPill,
  adminDialogBodyClassName,
  adminDialogCancelButtonClassName,
  adminDialogContentClassName,
  adminDialogFooterClassName,
  adminDialogHeaderClassName,
  adminDialogSubmitButtonClassName,
  adminFormFieldClassName,
  adminFormLabelClassName,
  adminPrimaryActionClassName,
  adminContentStandardClassName,
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
import type { DetailRow, KategoriRow, JenisRow } from '#/lib/master-data/shared'

export const Route = createFileRoute('/admin/master-data/kategori')({
  component: KategoriPage,
})

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function KategoriPage() {
  const { showToast } = useAppToast()
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
  const [formJenisId, setFormJenisId] = useState('')
  const [formNama, setFormNama] = useState('')
  const [formDeskripsi, setFormDeskripsi] = useState('')
  const [unsavedConfirmOpen, setUnsavedConfirmOpen] = useState(false)

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
  const createDefaultJenisId = filterJenis || (jenisList[0]?.id ?? '')
  const isModalDirty = modalOpen && !saving && (
    editing
      ? formJenisId !== editing.jenis_permintaan_id || formNama !== editing.nama || formDeskripsi !== (editing.deskripsi ?? '')
      : Boolean(formNama.trim() || formDeskripsi.trim() || formJenisId !== createDefaultJenisId)
  )

  useAdminFormLeaveGuard(isModalDirty)

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
      showToast({
        title: 'Berhasil',
        description: editing ? 'Kategori berhasil diperbarui.' : 'Kategori berhasil ditambahkan.',
        variant: 'success',
      })
      fetchData()
    } catch (err) {
      const message = getErrorMessage(err, 'Gagal menyimpan')
      setError(message)
      showToast({ title: 'Gagal', description: message, variant: 'error' })
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await apiMutation(`/master-kategori/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      showToast({
        title: 'Berhasil',
        description: 'Kategori berhasil dihapus.',
        variant: 'success',
      })
      fetchData()
    } catch (err) {
      showToast({
        title: 'Gagal',
        description: getErrorMessage(err, 'Gagal menghapus kategori'),
        variant: 'error',
      })
    } finally { setSaving(false) }
  }

  return (
    <PageLayout>
      <div className={adminPageContainerClassName}>
        <AdminPageHeader
          className={adminContentStandardClassName}
          icon={<Tag />}
          eyebrow={<><span>Admin Sistem</span><span>/</span><span>Master Data</span></>}
          title="Kategori Permintaan"
          description="Kelola kategori permintaan sebagai turunan dari Jenis Permintaan."
          actions={<Button onClick={openCreate} className={adminPrimaryActionClassName + ' gap-2'} disabled={jenisList.length === 0}><Plus />Tambah Kategori</Button>}
        />

        <AdminSearchPanel className={adminContentStandardClassName + ' ' + adminTableToolbarClassName} id="kategori-search" label="Cari kategori permintaan" value={search} onChange={setSearch} placeholder="Cari kategori..." resultText={`Total ${filtered.length} Kategori`}>
          <AdminFilterSelect
            value={filterJenis}
            onChange={setFilterJenis}
            ariaLabel="Filter kategori berdasarkan jenis permintaan"
            options={[
              { value: '', label: 'Semua Jenis' },
              ...jenisList.map(j => ({ value: j.id, label: j.nama })),
            ]}
          />
        </AdminSearchPanel>

        {loading ? (
          <LoadingState variant="list" label="Memuat kategori permintaan" />
        ) : filtered.length === 0 ? (
          <EmptyState title="Belum ada kategori" description="Pilih jenis dan tambahkan kategori pertama." icon={<Tag size={18} />} action={jenisList.length > 0 && <Button onClick={openCreate} size="sm" variant="outline" className="gap-1.5"><Plus size={14} />Tambah Kategori</Button>} />
        ) : (
          <AdminTableShell className={adminContentStandardClassName + ' ' + adminTableBodyClassName}>
            <Table>
              <TableHeader>
                <TableRow>
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
                    <TableCell><AdminRelationPill tone="blue">{item.jenis_nama || '—'}</AdminRelationPill></TableCell>
                    <TableCell><span className="text-xs text-on-surface-variant">{item.deskripsi || '—'}</span></TableCell>
                    <TableCell className="text-center">
                      <AdminCountPill count={item.jumlah_detail ?? 0} label="Detail" />
                    </TableCell>
                    <TableCell className="text-center">
                      <AdminActionButtons
                        onEdit={() => openEdit(item)}
                        onDelete={() => setDeleteTarget(item)}
                        editLabel={`Edit kategori ${item.nama}`}
                        deleteLabel={`Hapus kategori ${item.nama}`}
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
          <DialogHeader className={adminDialogHeaderClassName}><DialogTitle>{editing ? 'Edit Kategori Permintaan' : 'Tambah Kategori Permintaan Baru'}</DialogTitle></DialogHeader>
          <div className={adminDialogBodyClassName}>
            {error && <div className="bg-error/10 text-error text-xs px-3 py-2 rounded-lg font-medium">{error}</div>}
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName}>Jenis Permintaan <span className="text-error">*</span></Label>
              <AdminFormSelect
                value={formJenisId}
                onChange={setFormJenisId}
                ariaLabel="Pilih jenis permintaan untuk kategori"
                placeholder="Pilih jenis..."
                options={[
                  { value: '', label: 'Pilih jenis...' },
                  ...jenisList.map(j => ({ value: j.id, label: j.nama })),
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName} htmlFor="kn">Nama Kategori <span className="text-error">*</span></Label>
              <Input id="kn" value={formNama} onChange={e => setFormNama(e.target.value)} placeholder="Contoh: Translok" maxLength={255} className={adminFormFieldClassName} />
            </div>
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName} htmlFor="kd">Deskripsi</Label>
              <textarea id="kd" value={formDeskripsi} onChange={e => setFormDeskripsi(e.target.value)} placeholder="Deskripsi singkat..." rows={3} maxLength={500}
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
        title="Hapus Kategori?"
        confirmLabel={saving ? 'Menghapus...' : 'Hapus'}
        onConfirm={handleDelete}
        loading={saving}
      >
        Kategori <strong className="text-[#071A3A]">{deleteTarget?.nama}</strong> akan dihapus.
      </AdminConfirmationDialog>
    </PageLayout>
  )
}
