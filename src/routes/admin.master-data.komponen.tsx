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
import type { KegiatanRow, KomponenRow } from '#/lib/master-data/shared'

export const Route = createFileRoute('/admin/master-data/komponen')({
  component: KomponenPage,
})

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function KomponenPage() {
  const { showToast } = useAppToast()
  const [items, setItems] = useState<KomponenRow[]>([])
  const [kegiatans, setKegiatans] = useState<KegiatanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterKegiatan, setFilterKegiatan] = useState('')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<KomponenRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<KomponenRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formKegiatanId, setFormKegiatanId] = useState('')
  const [formNama, setFormNama] = useState('')
  const [formDeskripsi, setFormDeskripsi] = useState('')
  const [unsavedConfirmOpen, setUnsavedConfirmOpen] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const [ks, cs] = await Promise.all([
        apiFetch<KegiatanRow[]>('/master-kegiatan'),
        apiFetch<KomponenRow[]>('/master-komponen'),
      ])
      setKegiatans(ks)
      setItems(cs)
    } catch { /* silent */ } finally { setLoading(false) }
  }

  const filtered = items.filter(k => {
    const matchK = !filterKegiatan || k.kegiatan_id === filterKegiatan
    const matchS = !search || k.nama.toLowerCase().includes(search.toLowerCase()) || (k.deskripsi ?? '').toLowerCase().includes(search.toLowerCase())
    return matchK && matchS
  })
  const isModalDirty = modalOpen && !saving && (
    editing
      ? formKegiatanId !== editing.kegiatan_id || formNama !== editing.nama || formDeskripsi !== (editing.deskripsi ?? '')
      : Boolean(formNama.trim() || formDeskripsi.trim() || formKegiatanId !== (filterKegiatan || (kegiatans[0]?.id ?? '')))
  )

  useAdminFormLeaveGuard(isModalDirty)

  function openCreate() { setEditing(null); setFormKegiatanId(filterKegiatan || (kegiatans[0]?.id ?? '')); setFormNama(''); setFormDeskripsi(''); setError(''); setModalOpen(true) }
  function openEdit(item: KomponenRow) { setEditing(item); setFormKegiatanId(item.kegiatan_id); setFormNama(item.nama); setFormDeskripsi(item.deskripsi ?? ''); setError(''); setModalOpen(true) }
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
    if (!formKegiatanId) { setError('Pilih kegiatan'); return }
    if (!formNama.trim()) { setError('Nama tidak boleh kosong'); return }
    setSaving(true)
    try {
      if (editing) {
        await apiMutation(`/master-komponen/${editing.id}`, {
          method: 'PATCH',
          body: {
            kegiatanId: formKegiatanId,
            nama: formNama.trim(),
            deskripsi: formDeskripsi.trim() || undefined,
          },
        })
      } else {
        await apiMutation('/master-komponen', {
          method: 'POST',
          body: { kegiatanId: formKegiatanId, nama: formNama.trim(), deskripsi: formDeskripsi.trim() || undefined },
        })
      }
      setModalOpen(false)
      showToast({
        title: 'Berhasil',
        description: editing ? 'Komponen berhasil diperbarui.' : 'Komponen berhasil ditambahkan.',
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
      await apiMutation(`/master-komponen/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      showToast({
        title: 'Berhasil',
        description: 'Komponen berhasil dihapus.',
        variant: 'success',
      })
      fetchData()
    } catch (err) {
      showToast({
        title: 'Gagal',
        description: getErrorMessage(err, 'Gagal menghapus komponen'),
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
          title="Master Komponen"
          description="Kelola komponen di bawah kegiatan; komponen menjadi dasar Jenis Permintaan pada dokumen Material."
          actions={<Button onClick={openCreate} className={adminPrimaryActionClassName + ' gap-2'} disabled={kegiatans.length === 0}><Plus />Tambah Komponen</Button>}
        />

        <AdminSearchPanel
          className={adminContentStandardClassName + ' ' + adminTableToolbarClassName}
          id="komponen-search"
          label="Cari komponen"
          value={search}
          onChange={setSearch}
          placeholder="Cari komponen..."
          resultText={`Total ${filtered.length} Komponen`}
        >
          <AdminFilterSelect
            value={filterKegiatan}
            onChange={setFilterKegiatan}
            ariaLabel="Filter komponen berdasarkan kegiatan"
            options={[
              { value: '', label: 'Semua Kegiatan' },
              ...kegiatans.map(k => ({ value: k.id, label: k.nama })),
            ]}
          />
        </AdminSearchPanel>

        {loading ? (
          <LoadingState variant="list" label="Memuat komponen" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Belum ada komponen"
            description={filterKegiatan ? 'Tidak ada komponen untuk kegiatan ini.' : 'Tambahkan komponen pertama.'}
            icon={<ClipboardList size={18} />}
            action={kegiatans.length > 0 && <Button onClick={openCreate} size="sm" variant="outline" className="gap-1.5"><Plus size={14} />Tambah Komponen</Button>}
          />
        ) : (
          <AdminTableShell className={adminContentStandardClassName + ' ' + adminTableBodyClassName}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">No</TableHead>
                  <TableHead>Nama Komponen</TableHead>
                  <TableHead>Kegiatan Induk</TableHead>
                  <TableHead>Deskripsi</TableHead>
                  <TableHead className="text-center w-24">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item, i) => (
                  <TableRow key={item.id} className="group hover:bg-primary/5 transition-colors">
                    <TableCell className="text-center text-xs text-outline">{i + 1}</TableCell>
                    <TableCell><span className="font-semibold text-sm text-on-surface">{item.nama}</span></TableCell>
                    <TableCell><AdminRelationPill>{item.kegiatan_nama ?? '—'}</AdminRelationPill></TableCell>
                    <TableCell><span className="text-xs text-on-surface-variant">{item.deskripsi || '—'}</span></TableCell>
                    <TableCell className="text-center">
                      <AdminActionButtons
                        onEdit={() => openEdit(item)}
                        onDelete={() => setDeleteTarget(item)}
                        editLabel={`Edit komponen ${item.nama}`}
                        deleteLabel={`Hapus komponen ${item.nama}`}
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
          <DialogHeader className={adminDialogHeaderClassName}><DialogTitle>{editing ? 'Edit Komponen' : 'Tambah Komponen Baru'}</DialogTitle></DialogHeader>
          <div className={adminDialogBodyClassName}>
            {error && <div className="bg-error/10 text-error text-xs px-3 py-2 rounded-lg font-medium">{error}</div>}
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName}>Kegiatan <span className="text-error">*</span></Label>
              <AdminFormSelect
                value={formKegiatanId}
                onChange={setFormKegiatanId}
                ariaLabel="Pilih kegiatan untuk komponen"
                placeholder="Pilih Kegiatan"
                options={[
                  { value: '', label: 'Pilih Kegiatan' },
                  ...kegiatans.map(k => ({ value: k.id, label: k.nama })),
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName} htmlFor="cn">Nama Komponen <span className="text-error">*</span></Label>
              <Input id="cn" value={formNama} onChange={e => setFormNama(e.target.value)} placeholder="Contoh: Pengumpulan Data" maxLength={255} className={adminFormFieldClassName} />
            </div>
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName} htmlFor="cd">Deskripsi</Label>
              <textarea id="cd" value={formDeskripsi} onChange={e => setFormDeskripsi(e.target.value)} placeholder="Deskripsi..." rows={3} maxLength={500}
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
        title="Hapus Komponen?"
        confirmLabel={saving ? 'Menghapus...' : 'Hapus'}
        onConfirm={handleDelete}
        loading={saving}
      >
        Komponen <strong className="text-[#071A3A]">{deleteTarget?.nama}</strong> akan dihapus dari daftar komponen.
      </AdminConfirmationDialog>
    </PageLayout>
  )
}
