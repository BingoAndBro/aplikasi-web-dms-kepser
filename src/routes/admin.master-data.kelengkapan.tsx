import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import {
  adminContentWideClassName,
  adminDialogBodyClassName,
  adminDialogCancelButtonClassName,
  adminDialogContentClassName,
  adminDialogFooterClassName,
  adminDialogHeaderClassName,
  adminDialogSubmitButtonClassName,
  adminFormFieldClassName,
  adminFormLabelClassName,
  AdminConfirmationDialog,
  AdminFilterSelect,
  AdminPageHeader,
  useAdminFormLeaveGuard,
} from '#/components/admin/AdminPagePrimitives'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { useAppToast } from '#/components/ui/AppToast'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { EmptyState } from '#/components/ui/EmptyState'
import { LoadingState } from '#/components/ui/LoadingState'
import { Check, ClipboardList, Edit2, FileCheck, FileText, Plus, ShieldCheck, Trash2, UsersRound } from 'lucide-react'
import { apiFetch } from '#/lib/api-client'
import { ApiError, apiMutation } from '#/lib/api-mutation'
import { normalizeKelengkapanName } from '#/lib/kelengkapan-validation'
import type {
  DetailRow,
  FungsiRow,
  JenisRow,
  KategoriRow,
  KegiatanRow,
  KelengkapanRow,
  KomponenRow,
} from '#/lib/master-data/shared'

export const Route = createFileRoute('/admin/master-data/kelengkapan')({
  component: KelengkapanPage,
})

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

// Kelengkapan is unique per exact combination, so only rows scoped to exactly
// the selected Komponen + Jenis + Kategori + Detail (or no Detail) belong here.
function matchesSelectedChain(
  row: KelengkapanRow,
  komponenId: string,
  jenisId: string,
  kategoriId: string,
  detailId: string | null,
): boolean {
  return row.komponen_permintaan_id === komponenId
    && row.jenis_permintaan_id === jenisId
    && row.kategori_permintaan_id === kategoriId
    && (row.detail_permintaan_id ?? null) === detailId
}

function hasLoadedDuplicateKelengkapan(
  items: KelengkapanRow[],
  input: {
    editingId?: string
    isKetuaTim: boolean
    namaDokumen: string
    komponenPermintaanId: string | null
    jenisPermintaanId: string | null
    kategoriPermintaanId: string | null
    detailPermintaanId: string | null
  },
): boolean {
  const normalizedName = normalizeKelengkapanName(input.namaDokumen)
  if (!normalizedName) return false

  return items.some(item =>
    item.id !== input.editingId
    && item.is_ketua_tim === input.isKetuaTim
    && (item.komponen_permintaan_id ?? null) === input.komponenPermintaanId
    && (item.jenis_permintaan_id ?? null) === input.jenisPermintaanId
    && (item.kategori_permintaan_id ?? null) === input.kategoriPermintaanId
    && (item.detail_permintaan_id ?? null) === input.detailPermintaanId
    && normalizeKelengkapanName(item.nama_dokumen) === normalizedName
  )
}

const compactKelengkapanSelectClassName =
  'w-full min-w-0 [&>button]:h-9 [&>button]:rounded-[18px] [&>button]:py-1.5 [&>button]:pl-4 [&>button]:pr-3 [&>button]:text-[13px] [&>button]:shadow-[0_2px_6px_rgba(15,23,42,0.05)] [&>div]:top-[calc(100%+4px)] [&>div]:z-50 [&>div]:max-h-56 [&>div]:overflow-y-auto [&>div]:rounded-xl [&>div_button]:px-4 [&>div_button]:py-2 [&>div_button]:text-[13px]'

function KelengkapanPage() {
  const { showToast } = useAppToast()
  const [fungsis, setFungsis] = useState<FungsiRow[]>([])
  const [kegiatans, setKegiatans] = useState<KegiatanRow[]>([])
  const [komponenList, setKomponenList] = useState<KomponenRow[]>([])
  const [jenisList, setJenisList] = useState<JenisRow[]>([])
  const [kategoriList, setKategoriList] = useState<KategoriRow[]>([])
  const [detailList, setDetailList] = useState<DetailRow[]>([])
  const [detailLoadedFor, setDetailLoadedFor] = useState('')
  const [items, setItems] = useState<KelengkapanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterFungsi, setFilterFungsi] = useState('')
  const [filterKegiatan, setFilterKegiatan] = useState('')
  const [filterKomponen, setFilterKomponen] = useState('')
  const [filterJenis, setFilterJenis] = useState('')
  const [filterKategori, setFilterKategori] = useState('')
  const [filterDetail, setFilterDetail] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<KelengkapanRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<KelengkapanRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formIsKetuaTim, setFormIsKetuaTim] = useState(false)
  const [formNamaDokumen, setFormNamaDokumen] = useState('')
  const [formRequired, setFormRequired] = useState(true)
  const [formKomponenId, setFormKomponenId] = useState('')
  const [formJenisId, setFormJenisId] = useState('')
  const [formKategoriId, setFormKategoriId] = useState('')
  const [formDetailId, setFormDetailId] = useState('')
  const [formInitialSnapshot, setFormInitialSnapshot] = useState<string | null>(null)
  const [unsavedConfirmOpen, setUnsavedConfirmOpen] = useState(false)

  useEffect(() => { fetchFungsis(); fetchJenisList() }, [])

  useEffect(() => {
    if (filterFungsi) { fetchKegiatans(filterFungsi) } else { setKegiatans([]); setFilterKegiatan(''); setItems([]) }
  }, [filterFungsi])

  useEffect(() => {
    if (filterKegiatan) { fetchKomponen(filterKegiatan) } else { setKomponenList([]); setFilterKomponen('') }
  }, [filterKegiatan])

  useEffect(() => {
    if (filterJenis) { fetchKategori(filterJenis) } else { setKategoriList([]); setFilterKategori(''); setFilterDetail(''); setDetailList([]) }
  }, [filterJenis])

  useEffect(() => {
    setDetailLoadedFor('')
    if (filterKategori) { fetchDetail(filterKategori) } else { setDetailList([]); setFilterDetail('') }
  }, [filterKategori])

  // Leaf Rantai Permintaan: Kategori tanpa Detail, atau Detail sudah dipilih.
  const detailReady = Boolean(filterKategori) && detailLoadedFor === filterKategori
  const leafReached = Boolean(filterJenis && detailReady && (detailList.length === 0 || filterDetail))
  const contextComplete = Boolean(filterFungsi && filterKegiatan && filterKomponen && leafReached)
  const missingContext = [
    !filterFungsi && 'Fungsi',
    !filterKegiatan && 'Kegiatan',
    !filterKomponen && 'Komponen',
    !filterJenis && 'Jenis Permintaan',
    !filterKategori && 'Kategori Permintaan',
    detailReady && detailList.length > 0 && !filterDetail && 'Detail Permintaan',
  ].filter((label): label is string => Boolean(label))

  useEffect(() => {
    if (contextComplete) fetchKelengkapan()
    else setItems([])
  }, [contextComplete, filterKegiatan, filterKomponen, filterJenis, filterKategori, filterDetail])

  async function fetchFungsis() {
    try {
      const data = await apiFetch<FungsiRow[]>('/master-fungsi')
      setFungsis(data)
    } catch { /* silent */ } finally { setLoading(false) }
  }

  async function fetchKomponen(kegiatanId: string) {
    try {
      const data = await apiFetch<KomponenRow[]>('/master-komponen', {
        query: { kegiatan_id: kegiatanId },
      })
      setKomponenList(data)
      setFilterKomponen('')
    } catch { /* silent */ }
  }

  async function fetchJenisList() {
    try {
      const data = await apiFetch<JenisRow[]>('/master-jenis')
      setJenisList(data)
    } catch { /* silent */ }
  }

  async function fetchKegiatans(fungsiId: string) {
    try {
      const data = await apiFetch<KegiatanRow[]>('/master-kegiatan', {
        query: { fungsi_id: fungsiId },
      })
      setKegiatans(data)
      setFilterKegiatan(''); setFilterKomponen('')
    } catch { /* silent */ }
  }

  async function fetchKategori(jenisId: string) {
    try {
      const data = await apiFetch<KategoriRow[]>('/master-kategori', {
        query: { jenis_id: jenisId },
      })
      setKategoriList(data)
      setFilterKategori(''); setFilterDetail(''); setDetailList([])
    } catch { /* silent */ }
  }

  async function fetchDetail(kategoriId: string) {
    try {
      const data = await apiFetch<DetailRow[]>('/master-detail', {
        query: { kategori_id: kategoriId },
      })
      setDetailList(data)
      setFilterDetail('')
      setDetailLoadedFor(kategoriId)
    } catch { /* silent */ }
  }

  async function fetchKelengkapan() {
    setLoading(true)
    try {
      const data = await apiFetch<KelengkapanRow[]>('/master-kelengkapan', {
        query: { kegiatan_id: filterKegiatan },
      })
      setItems(data.filter(row => matchesSelectedChain(
        row,
        filterKomponen,
        filterJenis,
        filterKategori,
        filterDetail || null,
      )))
    } catch { /* silent */ } finally { setLoading(false) }
  }

  const filteredByRole = (isKetuaTim: boolean) => items.filter(k => k.is_ketua_tim === isKetuaTim)
  const currentFormSnapshot = JSON.stringify({
    isKetuaTim: formIsKetuaTim,
    namaDokumen: formNamaDokumen,
    required: formRequired,
    komponenId: formKomponenId,
    jenisId: formJenisId,
    kategoriId: formKategoriId,
    detailId: formDetailId,
  })
  const isModalDirty = modalOpen && !saving && formInitialSnapshot !== null && currentFormSnapshot !== formInitialSnapshot

  useAdminFormLeaveGuard(isModalDirty)

  function openCreate(isKetua: boolean) {
    const snapshot = JSON.stringify({
      isKetuaTim: isKetua,
      namaDokumen: '',
      required: true,
      komponenId: filterKomponen,
      jenisId: filterJenis,
      kategoriId: filterKategori,
      detailId: filterDetail,
    })
    setEditing(null)
    setFormIsKetuaTim(isKetua)
    setFormNamaDokumen('')
    setFormRequired(true)
    setFormKomponenId(filterKomponen)
    setFormJenisId(filterJenis)
    setFormKategoriId(filterKategori)
    setFormDetailId(filterDetail)
    setFormInitialSnapshot(snapshot)
    setError('')
    setModalOpen(true)
  }

  function openEdit(item: KelengkapanRow) {
    const snapshot = JSON.stringify({
      isKetuaTim: item.is_ketua_tim,
      namaDokumen: item.nama_dokumen,
      required: item.required,
      komponenId: item.komponen_permintaan_id ?? '',
      jenisId: item.jenis_permintaan_id ?? '',
      kategoriId: item.kategori_permintaan_id ?? '',
      detailId: item.detail_permintaan_id ?? '',
    })
    setEditing(item)
    setFormIsKetuaTim(item.is_ketua_tim)
    setFormNamaDokumen(item.nama_dokumen)
    setFormRequired(item.required)
    setFormKomponenId(item.komponen_permintaan_id ?? '')
    setFormJenisId(item.jenis_permintaan_id ?? '')
    setFormKategoriId(item.kategori_permintaan_id ?? '')
    setFormDetailId(item.detail_permintaan_id ?? '')
    setFormInitialSnapshot(snapshot)
    setError('')
    setModalOpen(true)
  }
  function closeModal() {
    setModalOpen(false)
    setUnsavedConfirmOpen(false)
    setFormInitialSnapshot(null)
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
    if (!formNamaDokumen.trim()) { setError('Nama dokumen tidak boleh kosong'); return }
    const nextScope = {
      editingId: editing?.id,
      isKetuaTim: formIsKetuaTim,
      namaDokumen: formNamaDokumen.trim(),
      komponenPermintaanId: formKomponenId || null,
      jenisPermintaanId: formJenisId || null,
      kategoriPermintaanId: formKategoriId || null,
      detailPermintaanId: formDetailId || null,
    }
    if (hasLoadedDuplicateKelengkapan(items, nextScope)) {
      setError('Kelengkapan sudah ada untuk detail permintaan dan tipe ini')
      return
    }

    setSaving(true)
    try {
      if (editing) {
        await apiMutation(`/master-kelengkapan/${editing.id}`, {
          method: 'PATCH',
          body: {
            namaDokumen: formNamaDokumen.trim(),
            required: formRequired,
            komponenId: formKomponenId || null,
            jenisPermintaanId: formJenisId || null,
            kategoriPermintaanId: formKategoriId || null,
            detailPermintaanId: formDetailId || null,
          },
        })
      } else {
        await apiMutation('/master-kelengkapan', {
          method: 'POST',
          body: {
            kegiatanId: filterKegiatan,
            isKetuaTim: formIsKetuaTim,
            namaDokumen: formNamaDokumen.trim(),
            required: formRequired,
            komponenId: formKomponenId || undefined,
            jenisPermintaanId: formJenisId || undefined,
            kategoriPermintaanId: formKategoriId || undefined,
            detailPermintaanId: formDetailId || undefined,
          },
        })
      }
      setModalOpen(false)
      showToast({
        title: 'Berhasil',
        description: editing ? 'Item kelengkapan berhasil diperbarui.' : 'Item kelengkapan berhasil ditambahkan.',
        variant: 'success',
      })
      fetchKelengkapan()
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
      await apiMutation(`/master-kelengkapan/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      showToast({
        title: 'Berhasil',
        description: 'Item kelengkapan berhasil dihapus.',
        variant: 'success',
      })
      fetchKelengkapan()
    } catch (err) {
      showToast({
        title: 'Gagal',
        description: getErrorMessage(err, 'Gagal menghapus kelengkapan'),
        variant: 'error',
      })
    } finally { setSaving(false) }
  }

  function resetFilters() {
    setFilterFungsi('')
    setFilterKegiatan('')
    setFilterKomponen('')
    setFilterJenis('')
    setFilterKategori('')
    setFilterDetail('')
    setKegiatans([])
    setKomponenList([])
    setKategoriList([])
    setDetailList([])
    setItems([])
  }

  const activeChainLabel = getChainLabel(filterFungsi, filterKegiatan, filterKomponen, filterJenis, filterKategori, filterDetail, fungsis, kegiatans, komponenList, jenisList, kategoriList, detailList)
  const ketuaItems = filteredByRole(true)
  const anggotaItems = filteredByRole(false)

  return (
    <PageLayout className="bg-brand-surface px-4 pb-10 pt-8 sm:px-6 lg:px-8">
      <div className="space-y-5">
        <AdminPageHeader
          className={adminContentWideClassName + ' pt-1'}
          eyebrow={<><FileCheck size={12} /><span>Admin Sistem</span><span>/</span><span>Kelengkapan Dokumen</span></>}
          title="Kelengkapan Dokumen"
          description="Atur dokumen wajib/opsional berdasarkan fungsi, kegiatan, dan rantai permintaan untuk halaman Ajukan Dokumen."
        />

        <section className={adminContentWideClassName + ' overflow-visible rounded-[18px] border border-brand-border-strong bg-white shadow-[0_3px_14px_rgba(120,70,20,0.05)]'}>
          <div className="flex items-start justify-between gap-4 border-b border-brand-border-strong px-4 py-2.5">
            <div>
              <h2 className="text-sm font-extrabold text-text-strong">Pilih Konteks Kelengkapan</h2>
              <p className="mt-0.5 text-xs font-medium text-info-text">
                Tentukan fungsi, kegiatan, dan rantai permintaan sampai pilihan terakhir.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={resetFilters}
              className="h-8 rounded-md border-info-border bg-white px-4 text-xs font-bold text-info-text shadow-[0_2px_6px_rgba(15,23,42,0.06)] hover:border-brand-solid hover:bg-brand-surface hover:text-brand-solid"
            >
              Reset
            </Button>
          </div>

          <div className="grid gap-x-6 gap-y-4 px-4 pb-3 pt-3 lg:grid-cols-2 xl:grid-cols-[minmax(0,480px)_minmax(0,480px)] xl:gap-x-20">
            <div className="space-y-3">
              <KelengkapanGroupBadge number={1} label="Konteks Kegiatan" />
              <KelengkapanSelectField label="Fungsi" required>
                <AdminFilterSelect
                  value={filterFungsi}
                  onChange={setFilterFungsi}
                  ariaLabel="Pilih fungsi untuk kelengkapan"
                  className={compactKelengkapanSelectClassName}
                  options={[
                    { value: '', label: 'Pilih Fungsi' },
                    ...fungsis.map(f => ({ value: f.id, label: f.nama })),
                  ]}
                />
              </KelengkapanSelectField>

              <KelengkapanSelectField label="Kegiatan" required>
                <AdminFilterSelect
                  value={filterKegiatan}
                  onChange={value => { setFilterKegiatan(value); setFilterKomponen('') }}
                  ariaLabel="Pilih kegiatan untuk kelengkapan"
                  disabled={!filterFungsi}
                  className={compactKelengkapanSelectClassName}
                  options={[
                    { value: '', label: filterFungsi ? 'Pilih Kegiatan' : 'Pilih Fungsi dulu' },
                    ...kegiatans.map(k => ({ value: k.id, label: k.nama })),
                  ]}
                />
              </KelengkapanSelectField>

              <KelengkapanSelectField label="Komponen" required>
                <AdminFilterSelect
                  value={filterKomponen}
                  onChange={setFilterKomponen}
                  ariaLabel="Pilih komponen untuk kelengkapan"
                  disabled={!filterKegiatan}
                  className={compactKelengkapanSelectClassName}
                  options={[
                    { value: '', label: filterKegiatan ? 'Pilih Komponen' : 'Pilih Kegiatan dulu' },
                    ...komponenList.map(c => ({ value: c.id, label: c.nama })),
                  ]}
                />
              </KelengkapanSelectField>
            </div>

            <div className="space-y-3">
              <KelengkapanGroupBadge number={2} label="Rantai Permintaan" />
              <KelengkapanSelectField label="Jenis Permintaan" required>
                <AdminFilterSelect
                  value={filterJenis}
                  onChange={value => { setFilterJenis(value); setFilterKategori(''); setFilterDetail('') }}
                  ariaLabel="Pilih jenis permintaan untuk kelengkapan"
                  className={compactKelengkapanSelectClassName}
                  options={[
                    { value: '', label: 'Pilih Jenis Permintaan' },
                    ...jenisList.map(j => ({ value: j.id, label: j.nama })),
                  ]}
                />
              </KelengkapanSelectField>

              <KelengkapanSelectField label="Kategori Permintaan" required>
                <AdminFilterSelect
                  value={filterKategori}
                  onChange={value => { setFilterKategori(value); setFilterDetail('') }}
                  ariaLabel="Pilih kategori untuk kelengkapan"
                  disabled={!filterJenis}
                  className={compactKelengkapanSelectClassName}
                  options={[
                    { value: '', label: filterJenis ? 'Pilih Kategori Permintaan' : 'Pilih Jenis dulu' },
                    ...kategoriList.map(k => ({ value: k.id, label: k.nama })),
                  ]}
                />
              </KelengkapanSelectField>

              <KelengkapanSelectField label="Detail Permintaan" required={detailList.length > 0}>
                <AdminFilterSelect
                  value={filterDetail}
                  onChange={setFilterDetail}
                  ariaLabel="Pilih detail untuk kelengkapan"
                  disabled={!filterKategori || detailList.length === 0}
                  className={compactKelengkapanSelectClassName}
                  options={[
                    { value: '', label: detailReady && detailList.length === 0 ? 'Kategori ini menjadi leaf' : filterKategori ? 'Pilih Detail Permintaan' : 'Pilih Kategori dulu' },
                    ...detailList.map(d => ({ value: d.id, label: d.nama })),
                  ]}
                />
              </KelengkapanSelectField>
            </div>
          </div>
        </section>

        {/* Placeholder tetap tampil sampai seluruh konteks lengkap; baru diganti isian kelengkapan. */}
        {!contextComplete ? (
          <EmptyState
            title="Lengkapi konteks sampai leaf node"
            icon={<FileCheck size={18} />}
            description={(
              <>
                Kelengkapan dokumen berlaku untuk satu kombinasi Fungsi, Kegiatan, Komponen, Jenis, Kategori,
                dan Detail Permintaan. Pilih semuanya sampai leaf (Kategori tanpa Detail, atau Detail Permintaan)
                sebelum menambahkan kelengkapan.
                <span className="mt-2 block font-semibold text-text-strong">
                  Belum dipilih: {missingContext.join(', ')}
                </span>
              </>
            )}
          />
        ) : (
          loading ? (
            <LoadingState variant="list" label="Memuat konfigurasi kelengkapan" />
          ) : (
            <div className={adminContentWideClassName + ' space-y-5'}>
              <div className="flex flex-col gap-4 rounded-[18px] border border-brand-border bg-white px-5 py-5 shadow-[0_2px_10px_rgba(80,54,20,0.04)] lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-extrabold text-text-strong">
                    <Check size={15} className="text-team-member-icon-text" />
                    Konfigurasi Aktif
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-extrabold text-black">
                    {getChainParts(filterFungsi, filterKegiatan, filterKomponen, filterJenis, filterKategori, filterDetail, fungsis, kegiatans, komponenList, jenisList, kategoriList, detailList).map((part, index, parts) => (
                      <span key={part + index} className="contents">
                        <span>{part}</span>
                        {index < parts.length - 1 && <span className="text-[#B4A89A]">{'>'}</span>}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs font-medium text-info-text">
                    Kelengkapan ini akan digunakan pada Ajukan Dokumen sesuai peran pengguna pada kegiatan.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <KelengkapanMetric label="Leaf terpilih" />
                  <KelengkapanMetric label={`Ketua Tim: ${ketuaItems.length}`} />
                  <KelengkapanMetric label={`Anggota: ${anggotaItems.length}`} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <KelengkapanSection
                  title="Kelengkapan Ketua Tim"
                  description="Dokumen wajib dan opsional untuk peran Ketua Tim."
                  items={ketuaItems}
                  onAdd={() => openCreate(true)}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                  accent="orange"
                />
                <KelengkapanSection
                  title="Kelengkapan Anggota"
                  description="Dokumen wajib dan opsional untuk peran Anggota."
                  items={anggotaItems}
                  onAdd={() => openCreate(false)}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                  accent="teal"
                />
              </div>
            </div>
          )
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={open => open ? setModalOpen(true) : requestCloseModal()}>
        <DialogContent className={adminDialogContentClassName + ' sm:max-w-[560px]'}>
          <DialogHeader className={adminDialogHeaderClassName}>
            <DialogTitle>{editing ? `Edit Kelengkapan ${formIsKetuaTim ? 'Ketua Tim' : 'Anggota'}` : `Tambah Kelengkapan ${formIsKetuaTim ? 'Ketua Tim' : 'Anggota'}`}</DialogTitle>
          </DialogHeader>
          <div className={adminDialogBodyClassName}>
            {error && <div className="bg-error/10 text-error text-xs px-3 py-2 rounded-lg font-medium">{error}</div>}
            <div className="rounded-[14px] border border-info-border bg-info-surface px-4 py-4 shadow-[0_2px_8px_rgba(15,23,42,0.10)]">
              <div className="grid gap-2 text-sm font-bold text-text-strong sm:grid-cols-[64px_1fr]">
                <span className="text-text-muted">Konteks:</span>
                <span>{activeChainLabel}</span>
                <span className="text-text-muted">Untuk:</span>
                <span className="text-brand-text">{formIsKetuaTim ? 'Ketua Tim' : 'Anggota'}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className={adminFormLabelClassName}>Nama Dokumen <span className="text-error">*</span></Label>
              <Input value={formNamaDokumen} onChange={e => setFormNamaDokumen(e.target.value)} placeholder="Contoh: Surat Tugas" maxLength={255} className={adminFormFieldClassName + ' h-12'} />
            </div>
            <div>
              <Label className={adminFormLabelClassName}>Status Kelengkapan <span className="text-error">*</span></Label>
              <div className="grid gap-4 sm:grid-cols-2">
                <RequirementCard
                  selected={formRequired}
                  title="Wajib"
                  description="Harus dilampirkan"
                  onClick={() => setFormRequired(true)}
                />
                <RequirementCard
                  selected={!formRequired}
                  title="Opsional"
                  description="Boleh tidak dilampirkan"
                  onClick={() => setFormRequired(false)}
                />
              </div>
            </div>
          </div>
          <DialogFooter className={adminDialogFooterClassName}>
            <Button onClick={requestCloseModal} variant="outline" className={adminDialogCancelButtonClassName}>Batal</Button>
            <Button onClick={handleSave} disabled={saving} className={adminDialogSubmitButtonClassName}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
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
        title="Hapus Item Kelengkapan?"
        confirmLabel={saving ? 'Menghapus...' : 'Hapus'}
        onConfirm={handleDelete}
        loading={saving}
      >
        Dokumen <strong className="text-text-strong">{deleteTarget?.nama_dokumen}</strong> akan dihapus dari kelengkapan.
      </AdminConfirmationDialog>
    </PageLayout>
  )
}

function getChainLabel(
  fungsiId: string, kegiatanId: string, komponenId: string, jenisId: string, kategoriId: string, detailId: string,
  fungsis: FungsiRow[], kegiatans: KegiatanRow[], komponenList: KomponenRow[], jenisList: JenisRow[], kategoriList: KategoriRow[], detailList: DetailRow[]
): string {
  return getChainParts(fungsiId, kegiatanId, komponenId, jenisId, kategoriId, detailId, fungsis, kegiatans, komponenList, jenisList, kategoriList, detailList).join(' > ')
}

function getChainParts(
  fungsiId: string, kegiatanId: string, komponenId: string, jenisId: string, kategoriId: string, detailId: string,
  fungsis: FungsiRow[], kegiatans: KegiatanRow[], komponenList: KomponenRow[], jenisList: JenisRow[], kategoriList: KategoriRow[], detailList: DetailRow[]
): string[] {
  const parts: string[] = []
  if (fungsiId) { const f = fungsis.find(f => f.id === fungsiId); if (f) parts.push(f.nama) }
  if (kegiatanId) { const k = kegiatans.find(k => k.id === kegiatanId); if (k) parts.push(k.nama) }
  if (komponenId) { const c = komponenList.find(c => c.id === komponenId); if (c) parts.push(c.nama) }
  if (jenisId) { const j = jenisList.find(j => j.id === jenisId); if (j) parts.push(j.nama) }
  if (kategoriId) { const k = kategoriList.find(k => k.id === kategoriId); if (k) parts.push(k.nama) }
  if (detailId) { const d = detailList.find(d => d.id === detailId); if (d) parts.push(d.nama) }
  return parts
}

function KelengkapanSelectField({ label, required, children }: {
  label: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className="block min-w-0">
      <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-info-text">
        {label} {required && <span className="text-danger-text">*</span>}
      </span>
      {children}
    </div>
  )
}

function KelengkapanGroupBadge({ number, label }: { number: number; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-brand-border-strong bg-brand-surface px-2 py-1 text-[11px] font-extrabold text-brand-text">
      <span className="flex size-5 items-center justify-center rounded-md bg-brand-solid text-[11px] font-black text-white">
        {number}
      </span>
      {label}
    </div>
  )
}

function KelengkapanMetric({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-info-border bg-info-surface px-3 py-1.5 text-[11px] font-bold text-info-text">
      {label}
    </span>
  )
}

function RequirementCard({ selected, title, description, onClick }: {
  selected: boolean
  title: string
  description: string
  onClick: () => void
}) {
  const selectedClassName = title === 'Opsional'
    ? 'border-brand-solid bg-brand-surface text-brand-text shadow-[0_8px_20px_rgba(255,90,0,0.10)]'
    : 'border-danger-border bg-danger-surface text-danger-text shadow-[0_8px_20px_rgba(255,79,120,0.10)]'
  const selectedDescriptionClassName = title === 'Opsional' ? 'text-brand-text' : 'text-danger-text'
  const selectedDotClassName = title === 'Opsional' ? 'border-brand-solid' : 'border-danger-text'
  const selectedInnerDotClassName = title === 'Opsional' ? 'bg-brand-solid' : 'bg-danger-text'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[74px] items-center justify-between rounded-[18px] border px-4 py-3 text-left transition ${
        selected
          ? selectedClassName
          : 'border-info-border bg-white text-text-strong hover:border-brand-solid'
      }`}
    >
      <span>
        <span className="block text-base font-extrabold">{title}</span>
        <span className={`mt-0.5 block text-xs font-semibold ${selected ? selectedDescriptionClassName : 'text-text-muted'}`}>
          {description}
        </span>
      </span>
      <span className={`flex size-5 items-center justify-center rounded-full border-2 ${selected ? selectedDotClassName : 'border-info-border'}`}>
        {selected && <span className={`size-2.5 rounded-full ${selectedInnerDotClassName}`} />}
      </span>
    </button>
  )
}

function KelengkapanSection({ title, description, items, onAdd, onEdit, onDelete, accent }: {
  title: string
  description: string
  items: KelengkapanRow[]
  onAdd: () => void
  onEdit: (item: KelengkapanRow) => void
  onDelete: (item: KelengkapanRow) => void
  accent: 'orange' | 'teal'
}) {
  const isKetua = accent === 'orange'
  const iconClassName = isKetua
    ? 'border-brand-border-strong bg-brand-surface text-brand-solid'
    : 'border-team-member-icon-border bg-team-member-icon-surface text-team-member-icon-text'
  const countClassName = isKetua
    ? 'bg-brand-surface text-brand-text'
    : 'bg-team-member-count-surface text-team-member-count-text'
  const borderClassName = isKetua ? 'border-brand-border' : 'border-team-member-border'
  const topClassName = isKetua ? 'bg-brand-solid' : 'bg-team-member-solid'
  const ItemIcon = isKetua ? FileText : ClipboardList

  return (
    <div className={`overflow-hidden rounded-[20px] border bg-bg-surface shadow-[0_2px_10px_rgba(80,54,20,0.04)] ${borderClassName}`}>
      <div className={`h-0.5 ${topClassName}`} />
      <div className="flex items-start justify-between gap-4 px-5 py-5">
        <div className="flex min-w-0 gap-3">
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${iconClassName}`}>
            {isKetua ? <ShieldCheck size={17} /> : <UsersRound size={17} />}
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold text-text-strong">{title}</h3>
            <p className="mt-0.5 text-xs font-medium text-info-text">{description}</p>
          </div>
        </div>
        <span className={`rounded-md px-3 py-1.5 text-xs font-extrabold ${countClassName}`}>{items.length}</span>
      </div>

      <div className="px-5 pb-4">
        <Button
          onClick={onAdd}
          variant="outline"
          className="h-10 w-full justify-center gap-2 rounded-[13px] border border-dashed border-brand-border-strong bg-bg-surface text-sm font-semibold text-brand-text-muted hover:border-brand-solid hover:bg-brand-surface hover:text-brand-solid"
        >
          <Plus size={15} /> Tambah Dokumen {isKetua ? 'Ketua Tim' : 'Anggota'}
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="border-t border-brand-border px-6 py-9 text-center">
          <p className="text-xs font-medium text-text-muted">Belum ada kelengkapan.</p>
        </div>
      ) : (
        <div className="divide-y divide-brand-border border-t border-brand-border">
          {items.map(item => (
            <div key={item.id} className="group flex items-center gap-4 px-5 py-5 transition-colors hover:bg-brand-surface">
              <ItemIcon size={16} className={`shrink-0 ${isKetua ? 'text-brand-solid' : 'text-team-member-icon-text'}`} />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold text-black">{item.nama_dokumen}</span>
              </div>
              <span className={`shrink-0 rounded-md px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] ${item.required ? 'bg-danger-surface text-danger-text' : 'border border-info-border bg-info-surface text-text-muted'}`}>
                {item.required ? 'Wajib' : 'Opsional'}
              </span>
              <div className="flex gap-1 shrink-0 transition-opacity">
                <Button size="icon-xs" variant="ghost" onClick={() => onEdit(item)} className="text-black hover:text-brand-solid" aria-label={`Edit kelengkapan ${item.nama_dokumen}`}><Edit2 size={14} /></Button>
                <Button size="icon-xs" variant="ghost" onClick={() => onDelete(item)} className="text-black hover:text-error" aria-label={`Hapus kelengkapan ${item.nama_dokumen}`}><Trash2 size={14} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
