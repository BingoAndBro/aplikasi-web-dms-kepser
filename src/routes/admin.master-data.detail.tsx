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
import type { DetailRow, JenisRow, KategoriRow } from '#/lib/master-data/shared'

export const Route = createFileRoute('/admin/master-data/detail')({
  component: DetailPage,
})

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function DetailPage() {
  const { showToast } = useAppToast()
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
  const [formJenisId, setFormJenisId] = useState('')
  const [formKategoriId, setFormKategoriId] = useState('')
  const [formNama, setFormNama] = useState('')
  const [formDeskripsi, setFormDeskripsi] = useState('')
  const [unsavedConfirmOpen, setUnsavedConfirmOpen] = useState(false)

  useEffect(() => { fetchData(); fetchJenis(); fetchKategoriList() }, [])

  useEffect(() => {
    if (filterKategori && !kategoriList.some(k => k.id === filterKategori && (!filterJenis || k.jenis_permintaan_id === filterJenis))) {
      setFilterKategori('')
    }
  }, [filterJenis, filterKategori, kategoriList])

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
    (!filterJenis || kategoriList.some(k => k.id === f.kategori_permintaan_id && k.jenis_permintaan_id === filterJenis)) &&
    (!filterKategori || f.kategori_permintaan_id === filterKategori)
  )

  function getDefaultJenisId() {
    const kategori = kategoriList.find(k => k.id === filterKategori)
    return kategori?.jenis_permintaan_id ?? (filterJenis || kategoriList[0]?.jenis_permintaan_id || (jenisList[0]?.id ?? ''))
  }

  function getDefaultKategoriId(jenisId: string) {
    if (filterKategori && kategoriList.some(k => k.id === filterKategori && (!jenisId || k.jenis_permintaan_id === jenisId))) {
      return filterKategori
    }
    return kategoriList.find(k => k.jenis_permintaan_id === jenisId)?.id ?? ''
  }

  const createDefaultJenisId = getDefaultJenisId()
  const createDefaultKategoriId = getDefaultKategoriId(createDefaultJenisId)
  const editingJenisId = editing
    ? (kategoriList.find(k => k.id === editing.kategori_permintaan_id)?.jenis_permintaan_id ?? '')
    : ''
  const isModalDirty = modalOpen && !saving && (
    editing
      ? formJenisId !== editingJenisId || formKategoriId !== editing.kategori_permintaan_id || formNama !== editing.nama || formDeskripsi !== (editing.deskripsi ?? '')
      : Boolean(formNama.trim() || formDeskripsi.trim() || formJenisId !== createDefaultJenisId || formKategoriId !== createDefaultKategoriId)
  )

  useAdminFormLeaveGuard(isModalDirty)

  function openCreate() {
    setEditing(null)
    const nextJenisId = getDefaultJenisId()
    setFormJenisId(nextJenisId)
    setFormKategoriId(getDefaultKategoriId(nextJenisId))
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
      showToast({
        title: 'Berhasil',
        description: editing ? 'Detail berhasil diperbarui.' : 'Detail berhasil ditambahkan.',
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
      await apiMutation(`/master-detail/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      showToast({
        title: 'Berhasil',
        description: 'Detail berhasil dihapus.',
        variant: 'success',
      })
      fetchData()
    } catch (err) {
      showToast({
        title: 'Gagal',
        description: getErrorMessage(err, 'Gagal menghapus detail'),
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
          eyebrow={(
            <>
              <span>Admin / Master Data</span><ChevronRight size={10} />
              <span>Detail Permintaan</span>
            </>
          )}
          title="Detail Permintaan"
          description="Kelola detail permintaan opsional untuk kategori dokumen."
          actions={<Button onClick={openCreate} className={adminPrimaryActionClassName + ' gap-2'} disabled={jenisList.length === 0 || kategoriList.length === 0}><Plus />Tambah Detail</Button>}
        />
        <div className="hidden flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
              <Tag size={12} /><span>Admin / Master Data</span><ChevronRight size={10} />
              <span className="text-primary">Detail Permintaan</span>
            </div>
            <h1 className="font-headline text-2xl font-extrabold text-on-surface">Detail Permintaan</h1>
            <p className="text-on-surface-variant text-xs mt-1">Kelola detail permintaan (opsional — tidak semua kategori memiliki detail).</p>
          </div>
          <Button onClick={openCreate} size="sm" className="gap-1.5" disabled={jenisList.length === 0 || kategoriList.length === 0}><Plus size={14} />Tambah Detail</Button>
        </div>

        <AdminSearchPanel
          className={adminContentStandardClassName + ' ' + adminTableToolbarClassName}
          id="detail-search"
          label="Cari detail permintaan"
          value={search}
          onChange={setSearch}
          placeholder="Cari detail..."
          resultText={`Total ${filtered.length} Detail`}
        >
          <AdminFilterSelect
            value={filterJenis}
            ariaLabel="Filter detail berdasarkan jenis permintaan"
            onChange={value => { setFilterJenis(value); setFilterKategori('') }}
            options={[
              { value: '', label: 'Semua Jenis' },
              ...jenisList.map(j => ({ value: j.id, label: j.nama })),
            ]}
          />
          <AdminFilterSelect
            value={filterKategori}
            disabled={!filterJenis}
            ariaLabel="Filter detail berdasarkan kategori"
            placeholder="Pilih jenis terlebih dahulu"
            onChange={setFilterKategori}
            options={[
              { value: '', label: filterJenis ? 'Semua Kategori' : 'Pilih jenis terlebih dahulu' },
              ...kategoriList.filter(k => !filterJenis || k.jenis_permintaan_id === filterJenis).map(k => ({ value: k.id, label: k.nama })),
            ]}
          />
        </AdminSearchPanel>
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white/5 rounded-2xl border border-white/10">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center"><Tag size={24} className="text-primary" /></div>
            <div className="text-center">
              <p className="font-headline text-lg font-bold text-on-surface">Belum ada detail</p>
              <p className="text-on-surface-variant text-xs mt-1">Pilih jenis dan kategori, lalu tambahkan detail.</p>
            </div>
            {jenisList.length > 0 && kategoriList.length > 0 && <Button onClick={openCreate} size="sm" variant="outline" className="gap-1.5"><Plus size={14} />Tambah Detail</Button>}
          </div>
        ) : (
          <AdminTableShell className={adminContentStandardClassName + ' ' + adminTableBodyClassName}>
            <Table>
              <TableHeader>
                <TableRow>
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
                    <TableCell><AdminRelationPill>{item.kategori_nama || '—'}</AdminRelationPill></TableCell>
                    <TableCell><AdminRelationPill tone="blue">{item.jenis_nama || '—'}</AdminRelationPill></TableCell>
                    <TableCell><span className="text-xs text-on-surface-variant">{item.deskripsi || '—'}</span></TableCell>
                    <TableCell className="text-center">
                      <AdminActionButtons
                        onEdit={() => openEdit(item)}
                        onDelete={() => setDeleteTarget(item)}
                        editLabel={`Edit detail permintaan ${item.nama}`}
                        deleteLabel={`Hapus detail permintaan ${item.nama}`}
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
          <DialogHeader className={adminDialogHeaderClassName}><DialogTitle>{editing ? 'Edit Detail Permintaan' : 'Tambah Detail Permintaan Baru'}</DialogTitle></DialogHeader>
          <div className={adminDialogBodyClassName}>
            {error && <div className="bg-error/10 text-error text-xs px-3 py-2 rounded-lg font-medium">{error}</div>}
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName}>Jenis Permintaan <span className="text-error">*</span></Label>
              <AdminFormSelect
                value={formJenisId}
                onChange={value => { setFormJenisId(value); setFormKategoriId('') }}
                ariaLabel="Pilih jenis permintaan untuk detail"
                placeholder="Pilih jenis..."
                options={[
                  { value: '', label: 'Pilih jenis...' },
                  ...jenisList.map(j => ({ value: j.id, label: j.nama })),
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName}>Kategori Permintaan <span className="text-error">*</span></Label>
              <AdminFormSelect
                value={formKategoriId}
                onChange={setFormKategoriId}
                disabled={!formJenisId}
                ariaLabel="Pilih kategori untuk detail"
                placeholder="Pilih kategori..."
                options={[
                  { value: '', label: 'Pilih kategori...' },
                  ...kategoriList
                    .filter(k => !formJenisId || k.jenis_permintaan_id === formJenisId)
                    .map(k => ({ value: k.id, label: k.nama })),
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName} htmlFor="dn">Nama Detail <span className="text-error">*</span></Label>
              <Input id="dn" value={formNama} onChange={e => setFormNama(e.target.value)} placeholder="Contoh: Translok Biasa" maxLength={255} className={adminFormFieldClassName} />
            </div>
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName} htmlFor="dd">Deskripsi</Label>
              <textarea id="dd" value={formDeskripsi} onChange={e => setFormDeskripsi(e.target.value)} placeholder="Deskripsi singkat..." rows={3} maxLength={500}
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
        title="Hapus Detail?"
        confirmLabel={saving ? 'Menghapus...' : 'Hapus'}
        onConfirm={handleDelete}
        loading={saving}
      >
        Detail <strong className="text-[#071A3A]">{deleteTarget?.nama}</strong> akan dihapus.
      </AdminConfirmationDialog>
    </PageLayout>
  )
}
