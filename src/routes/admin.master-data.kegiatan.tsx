import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  AdminActionButtons,
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
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { useAppToast } from '#/components/ui/AppToast'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { EmptyState } from '#/components/ui/EmptyState'
import { LoadingState } from '#/components/ui/LoadingState'
import { Plus, ClipboardList } from 'lucide-react'
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
  const { showToast } = useAppToast()
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
  const [formFungsiId, setFormFungsiId] = useState('')
  const [formNama, setFormNama] = useState('')
  const [formDeskripsi, setFormDeskripsi] = useState('')
  const [unsavedConfirmOpen, setUnsavedConfirmOpen] = useState(false)

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
  const isModalDirty = modalOpen && !saving && (
    editing
      ? formFungsiId !== editing.fungsi_id || formNama !== editing.nama || formDeskripsi !== (editing.deskripsi ?? '')
      : Boolean(formNama.trim() || formDeskripsi.trim() || formFungsiId !== (filterFungsi || (fungsis[0]?.id ?? '')))
  )

  useAdminFormLeaveGuard(isModalDirty)

  function openCreate() { setEditing(null); setFormFungsiId(filterFungsi || (fungsis[0]?.id ?? '')); setFormNama(''); setFormDeskripsi(''); setError(''); setModalOpen(true) }
  function openEdit(item: KegiatanRow) { setEditing(item); setFormFungsiId(item.fungsi_id); setFormNama(item.nama); setFormDeskripsi(item.deskripsi ?? ''); setError(''); setModalOpen(true) }
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
      showToast({
        title: 'Berhasil',
        description: editing ? 'Kegiatan berhasil diperbarui.' : 'Kegiatan berhasil ditambahkan.',
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
      await apiMutation(`/master-kegiatan/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      showToast({
        title: 'Berhasil',
        description: 'Kegiatan berhasil dihapus.',
        variant: 'success',
      })
      fetchData()
    } catch (err) {
      showToast({
        title: 'Gagal',
        description: getErrorMessage(err, 'Gagal menghapus kegiatan'),
        variant: 'error',
      })
    } finally { setSaving(false) }
  }

  return (
    <PageLayout>
      <div className={adminPageContainerClassName}>
        <AdminPageHeader
          className={adminContentStandardClassName}
          icon={<ClipboardList />}
          eyebrow={<><span>Admin Sistem</span><span>/</span><span>Master Data</span></>}
          title="Master Kegiatan"
          description="Kelola kegiatan di bawah fungsi/departemen yang menjadi dasar Ketua Tim dan konfigurasi dokumen."
          actions={<Button onClick={openCreate} className={adminPrimaryActionClassName + ' gap-2'} disabled={fungsis.length === 0}><Plus />Tambah Kegiatan</Button>}
        />

        <AdminSearchPanel
          className={adminContentStandardClassName + ' ' + adminTableToolbarClassName}
          id="kegiatan-search"
          label="Cari kegiatan"
          value={search}
          onChange={setSearch}
          placeholder="Cari kegiatan..."
          resultText={`Total ${filtered.length} Kegiatan`}
        >
          <AdminFilterSelect
            value={filterFungsi}
            onChange={setFilterFungsi}
            ariaLabel="Filter kegiatan berdasarkan fungsi"
            options={[
              { value: '', label: 'Semua Fungsi' },
              ...fungsis.map(f => ({ value: f.id, label: f.nama })),
            ]}
          />
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
          <AdminTableShell className={adminContentStandardClassName + ' ' + adminTableBodyClassName}>
            <Table>
              <TableHeader>
                <TableRow>
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
                    <TableCell><AdminRelationPill>{item.fungsi_nama ?? '—'}</AdminRelationPill></TableCell>
                    <TableCell><span className="text-xs text-on-surface-variant">{item.deskripsi || '—'}</span></TableCell>
                    <TableCell className="text-center">
                      <AdminActionButtons
                        onEdit={() => openEdit(item)}
                        onDelete={() => setDeleteTarget(item)}
                        editLabel={`Edit kegiatan ${item.nama}`}
                        deleteLabel={`Hapus kegiatan ${item.nama}`}
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
          <DialogHeader className={adminDialogHeaderClassName}><DialogTitle>{editing ? 'Edit Kegiatan' : 'Tambah Kegiatan Baru'}</DialogTitle></DialogHeader>
          <div className={adminDialogBodyClassName}>
            {error && <div className="bg-error/10 text-error text-xs px-3 py-2 rounded-lg font-medium">{error}</div>}
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName}>Fungsi <span className="text-error">*</span></Label>
              <AdminFormSelect
                value={formFungsiId}
                onChange={setFormFungsiId}
                ariaLabel="Pilih fungsi untuk kegiatan"
                placeholder="Pilih Fungsi"
                options={[
                  { value: '', label: 'Pilih Fungsi' },
                  ...fungsis.map(f => ({ value: f.id, label: f.nama })),
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName} htmlFor="kn">Nama Kegiatan <span className="text-error">*</span></Label>
              <Input id="kn" value={formNama} onChange={e => setFormNama(e.target.value)} placeholder="Contoh: SAKERNAS" maxLength={255} className={adminFormFieldClassName} />
            </div>
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName} htmlFor="kd">Deskripsi</Label>
              <textarea id="kd" value={formDeskripsi} onChange={e => setFormDeskripsi(e.target.value)} placeholder="Deskripsi..." rows={3} maxLength={500}
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
        title="Hapus Kegiatan?"
        confirmLabel={saving ? 'Menghapus...' : 'Hapus'}
        onConfirm={handleDelete}
        loading={saving}
      >
        Kegiatan <strong className="text-text-strong">{deleteTarget?.nama}</strong> akan dihapus dari daftar kegiatan.
      </AdminConfirmationDialog>
    </PageLayout>
  )
}
