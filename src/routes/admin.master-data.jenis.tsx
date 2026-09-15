import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  AdminActionButtons,
  AdminFilterSelect,
  AdminFormSelect,
  AdminRelationPill,
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
import {
  Plus,
  Tag,
  ChevronRight,
} from 'lucide-react'
import { apiFetch } from '#/lib/api-client'
import { ApiError, apiMutation } from '#/lib/api-mutation'
import type { JenisRow, KegiatanRow, KomponenRow } from '#/lib/master-data/shared'

export const Route = createFileRoute('/admin/master-data/jenis')({
  component: JenisPage,
})

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function komponenLabel(komponen: KomponenRow, kegiatans: KegiatanRow[]): string {
  const kegiatan = kegiatans.find(k => k.id === komponen.kegiatan_id)
  return kegiatan ? `${kegiatan.nama} / ${komponen.nama}` : komponen.nama
}

function JenisPage() {
  const { showToast } = useAppToast()
  const [items, setItems] = useState<JenisRow[]>([])
  const [komponenList, setKomponenList] = useState<KomponenRow[]>([])
  const [kegiatanList, setKegiatanList] = useState<KegiatanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterKomponen, setFilterKomponen] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<JenisRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JenisRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formKomponenId, setFormKomponenId] = useState('')
  const [formNama, setFormNama] = useState('')
  const [formDeskripsi, setFormDeskripsi] = useState('')
  const [unsavedConfirmOpen, setUnsavedConfirmOpen] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const [jenis, komponens, kegiatans] = await Promise.all([
        apiFetch<JenisRow[]>('/master-jenis'),
        apiFetch<KomponenRow[]>('/master-komponen'),
        apiFetch<KegiatanRow[]>('/master-kegiatan'),
      ])
      setItems(jenis)
      setKomponenList(komponens)
      setKegiatanList(kegiatans)
    } catch { /* silent */ } finally { setLoading(false) }
  }

  const filtered = items.filter(f =>
    (f.nama.toLowerCase().includes(search.toLowerCase()) ||
    (f.deskripsi ?? '').toLowerCase().includes(search.toLowerCase())) &&
    (!filterKomponen || f.komponen_id === filterKomponen)
  )
  const createDefaultKomponenId = filterKomponen || (komponenList[0]?.id ?? '')
  const isModalDirty = modalOpen && !saving && (
    editing
      ? formKomponenId !== editing.komponen_id || formNama !== editing.nama || formDeskripsi !== (editing.deskripsi ?? '')
      : Boolean(formNama.trim() || formDeskripsi.trim() || formKomponenId !== createDefaultKomponenId)
  )

  useAdminFormLeaveGuard(isModalDirty)

  function openCreate() {
    setEditing(null)
    setFormKomponenId(filterKomponen || (komponenList[0]?.id ?? ''))
    setFormNama('')
    setFormDeskripsi('')
    setError('')
    setModalOpen(true)
  }
  function openEdit(item: JenisRow) {
    setEditing(item)
    setFormKomponenId(item.komponen_id)
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
    if (!formKomponenId) { setError('Komponen harus dipilih'); return }
    setSaving(true)
    try {
      if (editing) {
        await apiMutation(`/master-jenis/${editing.id}`, {
          method: 'PATCH',
          body: {
            komponenId: formKomponenId,
            nama: formNama.trim(),
            deskripsi: formDeskripsi.trim() || undefined,
          },
        })
      } else {
        await apiMutation('/master-jenis', {
          method: 'POST',
          body: {
            komponenId: formKomponenId,
            nama: formNama.trim(),
            deskripsi: formDeskripsi.trim() || undefined,
          },
        })
      }
      setModalOpen(false)
      showToast({
        title: 'Berhasil',
        description: editing ? 'Jenis permintaan berhasil diperbarui.' : 'Jenis permintaan berhasil ditambahkan.',
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
      await apiMutation(`/master-jenis/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      showToast({
        title: 'Berhasil',
        description: 'Jenis permintaan berhasil dihapus.',
        variant: 'success',
      })
      fetchData()
    } catch (err) {
      showToast({
        title: 'Gagal',
        description: getErrorMessage(err, 'Gagal menghapus jenis permintaan'),
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
          eyebrow={(
            <>
              <span>Admin / Master Data</span><ChevronRight size={10} />
              <span>Jenis Permintaan</span>
            </>
          )}
          title="Jenis Permintaan"
          description="Kelola jenis permintaan dokumen sebagai turunan dari Komponen."
          actions={<Button onClick={openCreate} className={adminPrimaryActionClassName + ' gap-2'} disabled={komponenList.length === 0}><Plus />Tambah Jenis</Button>}
        />

        <AdminSearchPanel
          className={adminContentCompactClassName}
          id="jenis-search"
          label="Cari jenis permintaan"
          value={search}
          onChange={setSearch}
          placeholder="Cari jenis..."
          resultText={`Total ${filtered.length} Jenis`}
        >
          <AdminFilterSelect
            value={filterKomponen}
            onChange={setFilterKomponen}
            ariaLabel="Filter jenis permintaan berdasarkan komponen"
            options={[
              { value: '', label: 'Semua Komponen' },
              ...komponenList.map(k => ({ value: k.id, label: komponenLabel(k, kegiatanList) })),
            ]}
          />
        </AdminSearchPanel>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white/5 rounded-2xl border border-white/10">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center"><Tag size={24} className="text-primary" /></div>
            <div className="text-center">
              <p className="font-headline text-lg font-bold text-on-surface">Belum ada jenis permintaan</p>
              <p className="text-on-surface-variant text-xs mt-1">
                {komponenList.length === 0
                  ? 'Tambahkan komponen terlebih dahulu di Master Komponen.'
                  : 'Tambahkan jenis permintaan pertama untuk memulai.'}
              </p>
            </div>
            <Button onClick={openCreate} size="sm" variant="outline" className="gap-1.5" disabled={komponenList.length === 0}><Plus size={14} />Tambah Jenis</Button>
          </div>
        ) : (
          <AdminTableShell className={adminContentCompactClassName}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">No</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Komponen Induk</TableHead>
                  <TableHead>Deskripsi</TableHead>
                  <TableHead className="text-center w-24">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item, i) => (
                  <TableRow key={item.id} className="group hover:bg-primary/5 transition-colors">
                    <TableCell className="text-center text-xs text-outline">{i + 1}</TableCell>
                    <TableCell><span className="font-semibold text-sm text-on-surface">{item.nama}</span></TableCell>
                    <TableCell><AdminRelationPill tone="blue">{item.komponen_nama || '—'}</AdminRelationPill></TableCell>
                    <TableCell><span className="text-xs text-on-surface-variant">{item.deskripsi || '—'}</span></TableCell>
                    <TableCell className="text-center">
                      <AdminActionButtons
                        onEdit={() => openEdit(item)}
                        onDelete={() => setDeleteTarget(item)}
                        editLabel={`Edit jenis permintaan ${item.nama}`}
                        deleteLabel={`Hapus jenis permintaan ${item.nama}`}
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
          <DialogHeader className={adminDialogHeaderClassName}><DialogTitle>{editing ? 'Edit Jenis Permintaan' : 'Tambah Jenis Permintaan Baru'}</DialogTitle></DialogHeader>
          <div className={adminDialogBodyClassName}>
            {error && <div className="bg-error/10 text-error text-xs px-3 py-2 rounded-lg font-medium">{error}</div>}
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName}>Komponen <span className="text-error">*</span></Label>
              <AdminFormSelect
                value={formKomponenId}
                onChange={setFormKomponenId}
                ariaLabel="Pilih komponen untuk jenis permintaan"
                placeholder="Pilih komponen..."
                options={[
                  { value: '', label: 'Pilih komponen...' },
                  ...komponenList.map(k => ({ value: k.id, label: komponenLabel(k, kegiatanList) })),
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName} htmlFor="jn">Nama Jenis <span className="text-error">*</span></Label>
              <Input id="jn" value={formNama} onChange={e => setFormNama(e.target.value)} placeholder="Contoh: Perjalanan Dinas" maxLength={255} className={adminFormFieldClassName} />
            </div>
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName} htmlFor="jd">Deskripsi</Label>
              <textarea id="jd" value={formDeskripsi} onChange={e => setFormDeskripsi(e.target.value)} placeholder="Deskripsi singkat..." rows={3} maxLength={500}
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
        title="Hapus Jenis Permintaan?"
        confirmLabel={saving ? 'Menghapus...' : 'Hapus'}
        onConfirm={handleDelete}
        loading={saving}
      >
        Jenis permintaan <strong className="text-text-strong">{deleteTarget?.nama}</strong> akan dihapus.
      </AdminConfirmationDialog>
    </PageLayout>
  )
}
