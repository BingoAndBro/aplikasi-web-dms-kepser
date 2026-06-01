import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminStepCard,
} from '#/components/admin/AdminPagePrimitives'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { EmptyState } from '#/components/ui/EmptyState'
import { LoadingState } from '#/components/ui/LoadingState'
import { FileCheck, Plus, Edit2, Trash2, CheckCircle2, Circle, Lock } from 'lucide-react'
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
} from '#/lib/master-data/shared'

export const Route = createFileRoute('/admin/master-data/kelengkapan')({
  component: KelengkapanPage,
})

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function matchesSelectedChain(
  row: KelengkapanRow,
  jenisId?: string,
  kategoriId?: string,
  detailId?: string,
): boolean {
  const isLegacy = !row.jenis_permintaan_id && !row.kategori_permintaan_id && !row.detail_permintaan_id
  if (isLegacy) return true
  if (jenisId && row.jenis_permintaan_id && row.jenis_permintaan_id !== jenisId) return false
  if (kategoriId && row.kategori_permintaan_id && row.kategori_permintaan_id !== kategoriId) return false
  if (detailId && row.detail_permintaan_id && row.detail_permintaan_id !== detailId) return false
  return true
}

function hasLoadedDuplicateKelengkapan(
  items: KelengkapanRow[],
  input: {
    editingId?: string
    isKetuaTim: boolean
    namaDokumen: string
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
    && (item.jenis_permintaan_id ?? null) === input.jenisPermintaanId
    && (item.kategori_permintaan_id ?? null) === input.kategoriPermintaanId
    && (item.detail_permintaan_id ?? null) === input.detailPermintaanId
    && normalizeKelengkapanName(item.nama_dokumen) === normalizedName
  )
}

function KelengkapanPage() {
  const [fungsis, setFungsis] = useState<FungsiRow[]>([])
  const [kegiatans, setKegiatans] = useState<KegiatanRow[]>([])
  const [jenisList, setJenisList] = useState<JenisRow[]>([])
  const [kategoriList, setKategoriList] = useState<KategoriRow[]>([])
  const [detailList, setDetailList] = useState<DetailRow[]>([])
  const [items, setItems] = useState<KelengkapanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterFungsi, setFilterFungsi] = useState('')
  const [filterKegiatan, setFilterKegiatan] = useState('')
  const [filterJenis, setFilterJenis] = useState('')
  const [filterKategori, setFilterKategori] = useState('')
  const [filterDetail, setFilterDetail] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<KelengkapanRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<KelengkapanRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [formIsKetuaTim, setFormIsKetuaTim] = useState(false)
  const [formNamaDokumen, setFormNamaDokumen] = useState('')
  const [formRequired, setFormRequired] = useState(true)
  const [formJenisId, setFormJenisId] = useState('')
  const [formKategoriId, setFormKategoriId] = useState('')
  const [formDetailId, setFormDetailId] = useState('')

  // Chain complete (leaf node) when:
  // - Kategori selected + kategori tidak punya Detail children (leaf node), OR
  // - Detail selected (leaf node)
  // Jangan tampilkan kelengkapan jika belum sampai leaf node.
  const chainComplete =
    (filterJenis && filterKategori && detailList.length === 0) ||
    (filterJenis && filterKategori && filterDetail)

  useEffect(() => { fetchFungsis(); fetchJenis() }, [])

  useEffect(() => {
    if (filterFungsi) { fetchKegiatans(filterFungsi) } else { setKegiatans([]); setFilterKegiatan(''); setItems([]) }
  }, [filterFungsi])

  useEffect(() => {
    if (filterJenis) { fetchKategori(filterJenis) } else { setKategoriList([]); setFilterKategori(''); setFilterDetail(''); setDetailList([]) }
  }, [filterJenis])

  useEffect(() => {
    if (filterKategori) { fetchDetail(filterKategori) } else { setDetailList([]); setFilterDetail('') }
  }, [filterKategori])

  useEffect(() => {
    if (chainComplete && filterFungsi && filterKegiatan) fetchKelengkapan()
    else if (!filterFungsi || !filterKegiatan) setItems([])
  }, [filterFungsi, filterKegiatan, filterJenis, filterKategori, filterDetail, chainComplete])

  async function fetchFungsis() {
    try {
      const data = await apiFetch<FungsiRow[]>('/master-fungsi')
      setFungsis(data)
    } catch { /* silent */ } finally { setLoading(false) }
  }

  async function fetchJenis() {
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
      setFilterKegiatan(''); setItems([])
      // reset chain
      setFilterJenis(''); setFilterKategori(''); setFilterDetail('')
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
        filterJenis || undefined,
        filterKategori || undefined,
        filterDetail || undefined,
      )))
    } catch { /* silent */ } finally { setLoading(false) }
  }

  const filteredByRole = (isKetuaTim: boolean) => items.filter(k => k.is_ketua_tim === isKetuaTim)

  function openCreate(isKetua: boolean) {
    setEditing(null)
    setFormIsKetuaTim(isKetua)
    setFormNamaDokumen('')
    setFormRequired(true)
    setFormJenisId(filterJenis)
    setFormKategoriId(filterKategori)
    setFormDetailId(filterDetail)
    setError('')
    setModalOpen(true)
  }

  function openEdit(item: KelengkapanRow) {
    setEditing(item)
    setFormIsKetuaTim(item.is_ketua_tim)
    setFormNamaDokumen(item.nama_dokumen)
    setFormRequired(item.required)
    setFormJenisId(item.jenis_permintaan_id ?? '')
    setFormKategoriId(item.kategori_permintaan_id ?? '')
    setFormDetailId(item.detail_permintaan_id ?? '')
    setError('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!formNamaDokumen.trim()) { setError('Nama dokumen tidak boleh kosong'); return }
    const nextScope = {
      editingId: editing?.id,
      isKetuaTim: formIsKetuaTim,
      namaDokumen: formNamaDokumen.trim(),
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
            jenisPermintaanId: formJenisId || undefined,
            kategoriPermintaanId: formKategoriId || undefined,
            detailPermintaanId: formDetailId || undefined,
          },
        })
      }
      setModalOpen(false)
      setSuccessMsg(editing ? 'Item kelengkapan berhasil diperbarui.' : 'Item kelengkapan berhasil ditambahkan.')
      setTimeout(() => setSuccessMsg(''), 3000)
      fetchKelengkapan()
    } catch (err) { setError(getErrorMessage(err, 'Gagal menyimpan')) } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await apiMutation(`/master-kelengkapan/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      setSuccessMsg('Item kelengkapan berhasil dihapus.')
      setTimeout(() => setSuccessMsg(''), 3000)
      fetchKelengkapan()
    } catch (err) {
      alert(getErrorMessage(err, 'Gagal menghapus kelengkapan'))
    } finally { setSaving(false) }
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <AdminPageHeader
          eyebrow={<><FileCheck size={12} /><span>Admin Sistem</span><span>/</span><span>Kelengkapan Dokumen</span></>}
          title="Kelengkapan Dokumen"
          description="Workspace konfigurasi staged: pilih Fungsi, Kegiatan, Jenis Permintaan, Kategori, lalu Detail atau leaf sebelum mengubah Konfigurasi Aktif."
        />

        <AdminNotice>
          Konfigurasi ini mengatur syarat dokumen untuk Ketua Tim dan Anggota. Semantik API dan payload kelengkapan tetap sama; halaman ini hanya memperjelas konteks konfigurasi.
        </AdminNotice>

        {successMsg && (
          <div className="bg-green-50 border border-green-300 text-green-700 text-xs px-4 py-2.5 rounded-lg font-medium">
            {successMsg}
          </div>
        )}

        {/* Langkah 1: Fungsi & Kegiatan */}
        <AdminStepCard
          step={1}
          title="Pilih Fungsi dan Kegiatan"
          description="Kelengkapan tersimpan untuk kegiatan. Satu kegiatan dapat memiliki konfigurasi berbeda per chain permintaan."
          active={!filterKegiatan}
          complete={Boolean(filterFungsi && filterKegiatan)}
        >
          <div className="flex flex-wrap gap-3">
            <select value={filterFungsi} onChange={e => { setFilterFungsi(e.target.value); setFilterJenis(''); setFilterKategori(''); setFilterDetail('') }} aria-label="Pilih fungsi untuk kelengkapan"
              className="h-10 min-w-[180px] rounded-xl border border-orange-100 bg-[#FFFDF9] px-3 text-xs font-bold text-zinc-800 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70">
              <option value="">Pilih Fungsi</option>
              {fungsis.map(f => <option key={f.id} value={f.id}>{f.nama}</option>)}
            </select>
            {filterFungsi && (
              <select value={filterKegiatan} onChange={e => { setFilterKegiatan(e.target.value); setFilterJenis(''); setFilterKategori(''); setFilterDetail('') }} aria-label="Pilih kegiatan untuk kelengkapan"
                className="h-10 min-w-[220px] rounded-xl border border-orange-100 bg-[#FFFDF9] px-3 text-xs font-bold text-zinc-800 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70">
                <option value="">Pilih Kegiatan</option>
                {kegiatans.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </select>
            )}
          </div>
        </AdminStepCard>

        {/* Langkah 2: Chain - hanya tampil kalau kegiatan dipilih */}
        {filterKegiatan && (
          <AdminStepCard
            step={2}
            title="Pilih Jenis Permintaan, Kategori, dan Detail/leaf"
            description="Kelengkapan baru ditampilkan setelah konteks mencapai leaf. Jika kategori tidak memiliki detail, kategori menjadi leaf."
            active={!chainComplete}
            complete={Boolean(chainComplete)}
          >
            <div className="flex flex-wrap gap-3">
              <select value={filterJenis} onChange={e => { setFilterJenis(e.target.value); setFilterKategori(''); setFilterDetail('') }} aria-label="Pilih jenis permintaan untuk kelengkapan"
                className="h-10 min-w-[180px] rounded-xl border border-orange-100 bg-[#FFFDF9] px-3 text-xs font-bold text-zinc-800 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70">
                <option value="">Pilih Jenis Permintaan</option>
                {jenisList.map(j => <option key={j.id} value={j.id}>{j.nama}</option>)}
              </select>
              {filterJenis && (
                <select value={filterKategori} onChange={e => { setFilterKategori(e.target.value); setFilterDetail('') }} aria-label="Pilih kategori untuk kelengkapan"
                  className="h-10 min-w-[200px] rounded-xl border border-orange-100 bg-[#FFFDF9] px-3 text-xs font-bold text-zinc-800 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70">
                  <option value="">Pilih Kategori</option>
                  {kategoriList.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </select>
              )}
              {filterKategori && detailList.length > 0 && (
                <select value={filterDetail} onChange={e => setFilterDetail(e.target.value)} aria-label="Pilih detail untuk kelengkapan"
                  className="h-10 min-w-[200px] rounded-xl border border-orange-100 bg-[#FFFDF9] px-3 text-xs font-bold text-zinc-800 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70">
                  <option value="">Pilih Detail (opsional)</option>
                  {detailList.map(d => <option key={d.id} value={d.id}>{d.nama}</option>)}
                </select>
              )}
            </div>
          </AdminStepCard>
        )}

        {/* Kelengkapan section - hanya tampil kalau chain complete */}
        {filterKegiatan && chainComplete && (
          loading ? (
            <LoadingState variant="list" label="Memuat konfigurasi kelengkapan" />
          ) : (
            <AdminPanel className="space-y-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-700/70">Konfigurasi Aktif</p>
                <h2 className="mt-1 font-headline text-xl font-extrabold text-zinc-950">
                  {getChainLabel(filterFungsi, filterKegiatan, filterJenis, filterKategori, filterDetail, fungsis, kegiatans, jenisList, kategoriList, detailList)}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                  Tambahkan item WAJIB atau OPSIONAL secara terpisah untuk Ketua Tim dan Anggota.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <KelengkapanSection
                  title="Kelengkapan Ketua Tim"
                  items={filteredByRole(true)}
                  onAdd={() => openCreate(true)}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                  chainLabel={getChainLabel(filterFungsi, filterKegiatan, filterJenis, filterKategori, filterDetail, fungsis, kegiatans, jenisList, kategoriList, detailList)}
                />
                <KelengkapanSection
                  title="Kelengkapan Anggota"
                  items={filteredByRole(false)}
                  onAdd={() => openCreate(false)}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                  chainLabel={getChainLabel(filterFungsi, filterKegiatan, filterJenis, filterKategori, filterDetail, fungsis, kegiatans, jenisList, kategoriList, detailList)}
                />
              </div>
            </AdminPanel>
          )
        )}

        {/* Empty state - belum sampai leaf */}
        {filterKegiatan && !chainComplete && !loading && (
          <EmptyState
            title="Selesaikan chain untuk melihat kelengkapan"
            icon={<Lock size={18} />}
            description={(
              <>
              Pilih Jenis{filterJenis ? ' dan Kategori' : ''}{detailList.length > 0 ? ' (dan Detail jika ada)' : ''} untuk mencapai leaf node.
              {detailList.length > 0 ? ` Kategori "${kategoriList.find(k => k.id === filterKategori)?.nama}" punya ${detailList.length} detail.` : ''}
              </>
            )}
          />
        )}

        {!filterFungsi && !loading && (
          <EmptyState
            title="Pilih fungsi dan kegiatan"
            description="Mulai dari konteks kerja sebelum memilih chain Jenis Permintaan, Kategori, dan Detail."
            icon={<FileCheck size={18} />}
          />
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Item Kelengkapan' : 'Tambah Item Kelengkapan'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {error && <div className="bg-error/10 text-error text-xs px-3 py-2 rounded-lg font-medium">{error}</div>}
            <div className="space-y-1.5">
              <Label>Nama Dokumen <span className="text-error">*</span></Label>
              <Input value={formNamaDokumen} onChange={e => setFormNamaDokumen(e.target.value)} placeholder="Contoh: Laporan Pertanggungjawaban" maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label>Jenis Permintaan</Label>
              <select value={formJenisId} onChange={e => { setFormJenisId(e.target.value); setFormKategoriId(''); setFormDetailId('') }} aria-label="Pilih jenis permintaan untuk item kelengkapan"
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs text-on-surface focus:ring-1 focus:ring-ring/40 outline-none">
                <option value="">Semua jenis</option>
                {jenisList.map(j => <option key={j.id} value={j.id}>{j.nama}</option>)}
              </select>
            </div>
            {formJenisId && (
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <select value={formKategoriId} onChange={e => { setFormKategoriId(e.target.value); setFormDetailId('') }} aria-label="Pilih kategori untuk item kelengkapan"
                  className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs text-on-surface focus:ring-1 focus:ring-ring/40 outline-none">
                  <option value="">Semua kategori</option>
                  {kategoriList.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </select>
              </div>
            )}
            {formKategoriId && detailList.length > 0 && (
              <div className="space-y-1.5">
                <Label>Detail (Opsional)</Label>
                <select value={formDetailId} onChange={e => setFormDetailId(e.target.value)} aria-label="Pilih detail untuk item kelengkapan"
                  className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs text-on-surface focus:ring-1 focus:ring-ring/40 outline-none">
                  <option value="">Tanpa detail</option>
                  {detailList.map(d => <option key={d.id} value={d.id}>{d.nama}</option>)}
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formRequired} onChange={e => setFormRequired(e.target.checked)} className="w-4 h-4 accent-primary" />
              <span className="text-xs font-medium text-on-surface">Wajib (Required)</span>
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button onClick={() => setModalOpen(false)} variant="outline" size="sm">Batal</Button>
            <Button onClick={handleSave} disabled={saving} size="sm">{saving ? 'Menyimpan...' : editing ? 'Simpan' : 'Tambah'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Hapus Item Kelengkapan?</DialogTitle></DialogHeader>
          <p className="text-sm text-on-surface-variant">Dokumen <strong className="text-on-surface">{deleteTarget?.nama_dokumen}</strong> akan dihapus dari kelengkapan.</p>
          <DialogFooter className="gap-2">
            <Button onClick={() => setDeleteTarget(null)} variant="outline" size="sm">Batal</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving} size="sm">{saving ? 'Menghapus...' : 'Hapus'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}

function getChainLabel(
  fungsiId: string, kegiatanId: string, jenisId: string, kategoriId: string, detailId: string,
  fungsis: FungsiRow[], kegiatans: KegiatanRow[], jenisList: JenisRow[], kategoriList: KategoriRow[], detailList: DetailRow[]
): string {
  const parts = []
  if (fungsiId) { const f = fungsis.find(f => f.id === fungsiId); if (f) parts.push(f.nama) }
  if (kegiatanId) { const k = kegiatans.find(k => k.id === kegiatanId); if (k) parts.push(k.nama) }
  if (jenisId) { const j = jenisList.find(j => j.id === jenisId); if (j) parts.push(j.nama) }
  if (kategoriId) { const k = kategoriList.find(k => k.id === kategoriId); if (k) parts.push(k.nama) }
  if (detailId) { const d = detailList.find(d => d.id === detailId); if (d) parts.push(d.nama) }
  return parts.join(' / ')
}

function KelengkapanSection({ title, items, onAdd, onEdit, onDelete, chainLabel }: {
  title: string
  items: KelengkapanRow[]
  onAdd: () => void
  onEdit: (item: KelengkapanRow) => void
  onDelete: (item: KelengkapanRow) => void
  chainLabel: string
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-orange-100 bg-[#FFFDF9] px-6 py-4">
        <div>
          <h3 className="text-sm font-bold text-zinc-950">{title}</h3>
          <p className="mt-0.5 text-[10px] font-semibold text-zinc-500">{chainLabel}</p>
        </div>
        <Button onClick={onAdd} size="xs" variant="outline" className="gap-1"><Plus size={12} />Tambah</Button>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 px-6">
          <p className="text-xs text-zinc-500 text-center">Belum ada kelengkapan.</p>
          <Button onClick={onAdd} size="xs" variant="ghost" className="gap-1"><Plus size={12} />Tambah item pertama</Button>
        </div>
      ) : (
        <div className="divide-y divide-orange-50">
          {items.map(item => (
            <div key={item.id} className="group flex items-center gap-3 px-6 py-3 transition-colors hover:bg-orange-50/50">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                {item.required ? <CheckCircle2 size={14} className="text-primary shrink-0" /> : <Circle size={14} className="text-outline shrink-0" />}
                  <span className="truncate text-xs font-bold text-zinc-950">{item.nama_dokumen}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${item.required ? 'bg-orange-100 text-orange-800' : 'bg-zinc-100 text-zinc-600'}`}>
                    {item.required ? 'WAJIB' : 'OPSIONAL'}
                  </span>
                </div>
                <p className="mt-1 text-[10px] font-semibold text-zinc-500">Format: mengikuti dokumen yang diunggah</p>
              </div>
              <div className="flex gap-1 shrink-0 transition-opacity">
                <Button size="icon-xs" variant="ghost" onClick={() => onEdit(item)} aria-label={`Edit kelengkapan ${item.nama_dokumen}`}><Edit2 size={12} /></Button>
                <Button size="icon-xs" variant="ghost" onClick={() => onDelete(item)} className="hover:text-error" aria-label={`Hapus kelengkapan ${item.nama_dokumen}`}><Trash2 size={12} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
