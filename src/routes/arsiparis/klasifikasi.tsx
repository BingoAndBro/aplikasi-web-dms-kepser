import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import {
  Network, ChevronRight, AlertCircle, Loader2,
  Plus, Pencil, Trash2, X,
} from 'lucide-react'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/arsiparis/klasifikasi')({ component: KlasifikasiPage })

type KlasifikasiItem = {
  id: string
  nama: string
  deskripsi: string | null
  created_at: string
}

function KlasifikasiPage() {
  const [items, setItems] = useState<KlasifikasiItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<KlasifikasiItem | null>(null)
  const [isEdit, setIsEdit] = useState(false)
  const [nama, setNama] = useState('')
  const [deskripsi, setDeskripsi] = useState('')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/arsiparis/klasifikasi', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Gagal'); setLoading(false); return }
      setItems(json.klasifikasi ?? [])
    } catch { setError('Terjadi kesalahan') } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  function openTambah() {
    setSelectedItem(null); setIsEdit(false); setNama(''); setDeskripsi('')
    setFormErrors({}); setFormError(null); setModalOpen(true)
  }

  function openEdit(item: KlasifikasiItem) {
    setSelectedItem(item); setIsEdit(true); setNama(item.nama); setDeskripsi(item.deskripsi ?? '')
    setFormErrors({}); setFormError(null); setModalOpen(true)
  }

  function openDelete(item: KlasifikasiItem) {
    setSelectedItem(item); setDeleteError(null); setDeleteOpen(true)
  }

  async function handleSave() {
    const errors: Record<string, string> = {}
    if (!nama.trim()) errors.nama = 'Nama klasifikasi wajib diisi'
    if (nama.trim().length > 100) errors.nama = 'Maksimal 100 karakter'
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return }

    setFormLoading(true); setFormError(null)
    try {
      const body = { nama: nama.trim(), deskripsi: deskripsi.trim() || undefined }
      const res = await fetch('/api/arsiparis/klasifikasi', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setFormError(json.error ?? 'Gagal'); setFormLoading(false); return }
      setModalOpen(false); fetchData()
    } catch { setFormError('Terjadi kesalahan'); setFormLoading(false) }
  }

  async function handleDelete() {
    if (!selectedItem) return
    setDeleteLoading(true); setDeleteError(null)
    try {
      const res = await fetch(`/api/arsiparis/klasifikasi/id?id=${selectedItem.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) { setDeleteError(json.error ?? 'Gagal'); setDeleteLoading(false); return }
      setDeleteOpen(false); setSelectedItem(null); fetchData()
    } catch { setDeleteError('Terjadi kesalahan'); setDeleteLoading(false) }
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
              <Link to="/arsiparis" className="hover:text-primary">Arsiparis</Link>
              <ChevronRight size={10} />
              <span className="text-primary">Master Klasifikasi</span>
            </div>
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Master Klasifikasi Arsip</h2>
            <p className="text-on-surface-variant text-xs mt-1">{items.length} klasifikasi aktif.</p>
          </div>
          <Button onClick={openTambah} className="gap-1.5">
            <Plus size={14} />Tambah Klasifikasi
          </Button>
        </div>

        {/* Tambah/Edit Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
                <p className="font-semibold text-on-surface">{isEdit ? 'Edit Klasifikasi' : 'Tambah Klasifikasi'}</p>
                <button onClick={() => setModalOpen(false)} className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-surface-container-low transition-colors" aria-label="Tutup">
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">Nama Klasifikasi <span className="text-error">*</span></label>
                  <input type="text" value={nama} onChange={e => { setNama(e.target.value); setFormErrors(p => ({ ...p, nama: '' })) }}
                    placeholder="Contoh: Berkas Aktif"
                    className={cn('w-full px-3 py-2 border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring', formErrors.nama ? 'border-error' : 'border-border')}
                  />
                  {formErrors.nama && <p className="text-[10px] text-error mt-1">{formErrors.nama}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">Deskripsi <span className="text-outline font-normal">(opsional)</span></label>
                  <textarea value={deskripsi} onChange={e => setDeskripsi(e.target.value)} rows={3}
                    placeholder="Deskripsi klasifikasi..."
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                </div>
                {formError && <p className="text-xs text-error">{formError}</p>}
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)} disabled={!!formLoading}>Batal</Button>
                  <Button className="flex-1" onClick={handleSave} disabled={!!formLoading}>
                    {formLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    Simpan
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Modal */}
        {deleteOpen && selectedItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) setDeleteOpen(false) }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant/30">
                <Trash2 size={18} className="text-error shrink-0" />
                <p className="font-semibold text-on-surface">Hapus Klasifikasi?</p>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-xs text-on-surface-variant">Klasifikasi <strong>"{selectedItem.nama}"</strong> akan dinonaktifkan. Dokumen yang sudah menggunakan klasifikasi ini tidak terpengaruh.</p>
                {deleteError && <p className="text-xs text-error">{deleteError}</p>}
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setDeleteOpen(false)} disabled={!!deleteLoading}>Batal</Button>
                  <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={!!deleteLoading}>
                    {deleteLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Hapus
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-primary" /></div>
        ) : error ? (
          <div className="flex flex-col items-center py-20 gap-4 bg-error/5 rounded-2xl border border-error/20">
            <AlertCircle size={32} className="text-error" /><p className="text-sm text-on-surface-variant">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-4 bg-white/5 rounded-2xl border border-white/10">
            <div className="w-14 h-14 rounded-xl bg-blue-500/10 flex items-center justify-center"><Network size={24} className="text-blue-500" /></div>
            <p className="font-headline text-lg font-bold text-on-surface">Belum ada klasifikasi</p>
            <p className="text-on-surface-variant text-xs">Tambahkan klasifikasi arsip untuk digunakan saat pemberkasan.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-container-low/30 text-left">
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider w-10 text-center">No</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Nama Klasifikasi</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Deskripsi</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center w-24">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((k, i) => (
                    <tr key={k.id} className="border-t border-outline-variant/20 hover:bg-primary/5 transition-colors">
                      <td className="px-4 py-3 text-center text-outline">{i + 1}</td>
                      <td className="px-4 py-3 font-semibold text-on-surface">{k.nama}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{k.deskripsi ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon-xs" variant="ghost" onClick={() => openEdit(k)} aria-label="Edit">
                            <Pencil size={14} />
                          </Button>
                          <Button size="icon-xs" variant="ghost" onClick={() => openDelete(k)} aria-label="Hapus">
                            <Trash2 size={14} className="text-error" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  )
}
