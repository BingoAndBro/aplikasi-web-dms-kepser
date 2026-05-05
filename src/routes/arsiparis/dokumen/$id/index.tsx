import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  FileText, ChevronRight, Download, Eye, AlertCircle,
  Loader2, X, CheckCircle2,
} from 'lucide-react'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { cn } from '#/lib/utils'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

export const Route = createFileRoute('/arsiparis/dokumen/$id/')({
  component: ArsiparisDokumenDetailPage,
})

type Klasifikasi = { id: string; nama: string }

const RETENSI_OPTIONS = ['1 Tahun', '3 Tahun', '5 Tahun', '10 Tahun', 'Permanen'] as const

function retensiToYears(retensi: string): number {
  if (retensi === 'Permanen') return 999
  const match = retensi.match(/(\d+)/)
  return match ? parseInt(match[1]) : 1
}

function calcDate(dateStr: string, years: number): string {
  const d = new Date(dateStr)
  if (years === 999) return '9999-12-31'
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().split('T')[0]
}

function formatDate(dateStr: string): string {
  try { return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return dateStr }
}

type DokumenDetail = {
  id: string
  judul: string
  fungsi: { id: string; nama: string }
  kegiatan: { id: string; nama: string }
  tanggal: string
  tahun: number
  lampiran_urls: LampiranUrl[]
  created_by: { id: string; nama: string }
  status: string
  is_ketua_tim: boolean
  bendahara_approve: { nama: string; tanggal: string } | null
  arsip: { id: string; status_arsip: string; nomor_surat: string } | null
  is_archived: boolean
  nominal_realisasi: number | null
  jenis_permintaan_id?: string | null
  jenis_permintaan_nama?: string
  kategori_permintaan_id?: string | null
  kategori_permintaan_nama?: string
  detail_permintaan_id?: string | null
  detail_permintaan_nama?: string
}

function ArsiparisDokumenDetailPage() {
  const { id } = Route.useParams()
  const [dokumen, setDokumen] = useState<DokumenDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [klasifikasiList, setKlasifikasiList] = useState<Klasifikasi[]>([])
  const [nomorSurat, setNomorSurat] = useState('')
  const [klasifikasi, setKlasifikasi] = useState('')
  const [retensiAktif, setRetensiAktif] = useState<string>(RETENSI_OPTIONS[0])
  const [retensiInaktif, setRetensiInaktif] = useState<string>(RETENSI_OPTIONS[0])
  const [masaAktifBerakhir, setMasaAktifBerakhir] = useState('')
  const [masaInaktifBerakhir, setMasaInaktifBerakhir] = useState('')
  const [catatan, setCatatan] = useState('')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [formLoading, setFormLoading] = useState(false)
  const [formSubmitError, setFormSubmitError] = useState<string | null>(null)

  const [previewingIdx, setPreviewingIdx] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => { fetchData() }, [id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && previewingIdx !== null) closePreview() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [previewingIdx])

  async function fetchData() {
    setLoading(true); setFetchError(null)
    try {
      const res = await fetch(`/api/arsiparis/dokumen/${id}`, { credentials: 'include' })
      if (!res.ok) {
        const json = await res.json()
        setFetchError(json.error ?? 'Dokumen tidak dapat diakses')
        setLoading(false); return
      }
      const json = await res.json()
      setDokumen(json.dokumen)
    } catch { setFetchError('Terjadi kesalahan saat mengambil data') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetch('/api/arsiparis/klasifikasi', { credentials: 'include' })
      .then(r => r.json())
      .then(json => setKlasifikasiList(json.klasifikasi ?? []))
      .catch(() => {})
  }, [])

  function recalcDates() {
    if (!dokumen) return
    const archivedAt = dokumen.tanggal || new Date().toISOString().split('T')[0]
    const activeYears = retensiToYears(retensiAktif)
    const inactiveYears = retensiToYears(retensiInaktif)
    setMasaAktifBerakhir(calcDate(archivedAt, activeYears))
    const aktifEndDate = masaAktifBerakhir || calcDate(archivedAt, activeYears)
    setMasaInaktifBerakhir(calcDate(aktifEndDate, inactiveYears))
  }

  useEffect(() => { recalcDates() }, [dokumen, retensiAktif, retensiInaktif])

  async function handlePreview(index: number) {
    setPreviewingIdx(index); setPreviewUrl(null); setPreviewLoading(true)
    try {
      const res = await fetch(`/api/dokumen/${id}/preview/${index}`, { credentials: 'include' })
      const json = await res.json()
      if (json.signedUrl) { setPreviewUrl(json.signedUrl); setPreviewFilename(json.filename ?? `lampiran-${index + 1}`) }
    } catch { /* silent */ }
    finally { setPreviewLoading(false) }
  }

  function closePreview() { setPreviewingIdx(null); setPreviewUrl(null); setPreviewFilename('') }

  async function handleArchive() {
    const errors: Record<string, string> = {}
    if (!nomorSurat.trim()) errors.nomorSurat = 'Nomor surat wajib diisi'
    if (!klasifikasi) errors.klasifikasi = 'Klasifikasi wajib dipilih'
    if (!masaAktifBerakhir) errors.masaAktifBerakhir = 'Masa aktif berakhir wajib diisi'
    if (!masaInaktifBerakhir) errors.masaInaktifBerakhir = 'Masa inaktif berakhir wajib diisi'
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return }

    setFormLoading(true); setFormSubmitError(null)
    try {
      const res = await fetch(`/api/arsiparis/dokumen/${id}/archive`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomor_surat: nomorSurat.trim(),
          klasifikasi,
          retensi_aktif: retensiAktif,
          retensi_inaktif: retensiInaktif,
          masa_aktif_berakhir: masaAktifBerakhir,
          masa_inaktif_berakhir: masaInaktifBerakhir,
          catatan_arsiparis: catatan.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setFormSubmitError(json.error ?? 'Gagal'); setFormLoading(false); return }
      window.location.href = '/arsiparis/aktif'
    } catch { setFormSubmitError('Terjadi kesalahan'); setFormLoading(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="animate-spin text-primary" />
    </div>
  )

  if (fetchError || !dokumen) return (
    <div className="text-center py-20">
      <AlertCircle size={32} className="text-error mx-auto mb-3" />
      <p className="text-sm text-on-surface-variant">{fetchError ?? 'Dokumen tidak ditemukan'}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={() => window.location.href = '/arsiparis/inbox'}>Kembali ke Inbox</Button>
    </div>
  )

  const isArchived = !!dokumen.arsip

  return (
    <PageLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Preview Modal */}
        {previewingIdx !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) closePreview() }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/30 shrink-0">
                <FileText size={16} className="text-primary shrink-0" />
                <p className="text-sm font-semibold text-on-surface truncate flex-1">{previewFilename}</p>
                <span className="text-[10px] text-outline hidden sm:block">ESC</span>
                <button onClick={closePreview} className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-surface-container-low transition-colors shrink-0" aria-label="Tutup"><X size={16} /></button>
              </div>
              <div className="flex-1 overflow-auto bg-surface-container-low/30">
                {previewLoading ? <div className="flex items-center justify-center h-48"><Loader2 size={22} className="animate-spin text-primary" /></div>
                 : previewUrl ? <iframe src={previewUrl} className="w-full h-[calc(70vh-96px)] border-0" title={previewFilename} />
                 : <div className="flex items-center justify-center h-48"><p className="text-sm text-on-surface-variant">Gagal memuat pratinjau.</p></div>}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest">
          <Link to="/arsiparis" className="hover:text-primary">Arsiparis</Link>
          <ChevronRight size={10} />
          <Link to="/arsiparis/inbox" className="hover:text-primary">Pemberkasan</Link>
          <ChevronRight size={10} />
          <span className="text-primary">Detail</span>
        </div>

        <h2 className="font-headline text-xl font-extrabold text-on-surface">{dokumen.judul}</h2>

        <div className="flex items-center gap-3">
          <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">COMPLETED</Badge>
          {isArchived && (
            <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs"> Sudah Diarsipkan (#{dokumen.arsip?.nomor_surat})</Badge>
          )}
        </div>

        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Informasi Dokumen</p>
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Fungsi</p><p className="text-sm font-semibold text-on-surface">{dokumen.fungsi.nama ?? '—'}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kegiatan</p><p className="text-sm font-semibold text-on-surface">{dokumen.kegiatan.nama ?? '—'}</p></div>
            {dokumen.jenis_permintaan_id && (
              <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Jenis Permintaan</p><p className="text-sm font-semibold text-on-surface">{dokumen.jenis_permintaan_nama ?? '—'}</p></div>
            )}
            {dokumen.kategori_permintaan_id && (
              <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kategori Permintaan</p><p className="text-sm font-semibold text-on-surface">{dokumen.kategori_permintaan_nama ?? '—'}</p></div>
            )}
            {dokumen.detail_permintaan_id && (
              <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Detail Permintaan</p><p className="text-sm font-semibold text-on-surface">{dokumen.detail_permintaan_nama ?? '—'}</p></div>
            )}
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tahun</p><p className="text-sm font-semibold text-on-surface">{dokumen.tahun}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tanggal</p><p className="text-sm font-semibold text-on-surface">{formatDate(dokumen.tanggal)}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Peran</p><p className="text-sm font-semibold text-on-surface">{dokumen.is_ketua_tim ? 'Ketua Tim' : 'Anggota'}</p></div>
            <div className="col-span-2"><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Disetujui Bendahara</p><p className="text-sm font-semibold text-on-surface">{dokumen.bendahara_approve ? `${dokumen.bendahara_approve.nama} — ${formatDate(dokumen.bendahara_approve.tanggal)}` : '—'}</p></div>
            {dokumen.nominal_realisasi !== null && dokumen.nominal_realisasi !== undefined && (
              <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Nominal Realisasi</p><p className="text-sm font-semibold text-on-surface">Rp {dokumen.nominal_realisasi.toLocaleString('id-ID')}</p></div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Lampiran ({dokumen.lampiran_urls.length})</p>
          {dokumen.lampiran_urls.length === 0 ? (
            <p className="text-xs text-on-surface-variant text-center py-4">Belum ada lampiran.</p>
          ) : (
            <div className="space-y-2">
              {dokumen.lampiran_urls.map((lamp, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-surface-container-low/20 rounded-lg">
                  <FileText size={16} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-on-surface truncate">{lamp.nama}</p>
                    <p className="text-[10px] text-outline">{lamp.uploaded_at ? formatDate(lamp.uploaded_at) : ''}</p>
                  </div>
                  <Button size="icon-xs" variant="ghost" onClick={() => handlePreview(i)} aria-label="Pratinjau">
                    {previewingIdx === i ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                  </Button>
                  <Button size="icon-xs" variant="ghost" onClick={() => {
                    fetch(`/api/dokumen/${id}/download/${i}`, { credentials: 'include' })
                      .then(r => r.json())
                      .then(d => d.signedUrl && window.open(d.signedUrl, '_blank'))
                      .catch(() => alert('Gagal download'))
                  }} aria-label="Download"><Download size={14} /></Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <ActivityLog dokumenId={id} />

        {isArchived ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-green-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-700">Dokumen sudah diarsipkan</p>
              <p className="text-xs text-green-600">Nomor Surat: {dokumen.arsip?.nomor_surat}</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
            <p className="text-xs font-bold text-outline uppercase tracking-widest mb-4">Formulir Pemberkasan</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1.5">Nomor Surat <span className="text-error">*</span></label>
                <input
                  type="text"
                  value={nomorSurat}
                  onChange={e => { setNomorSurat(e.target.value); setFormErrors(p => ({ ...p, nomorSurat: '' })) }}
                  placeholder="Contoh: 001/ARSIP/2025"
                  className={cn('w-full px-3 py-2 border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring', formErrors.nomorSurat ? 'border-error' : 'border-border')}
                />
                {formErrors.nomorSurat && <p className="text-[10px] text-error mt-1">{formErrors.nomorSurat}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1.5">Klasifikasi <span className="text-error">*</span></label>
                <select
                  value={klasifikasi}
                  onChange={e => { setKlasifikasi(e.target.value); setFormErrors(p => ({ ...p, klasifikasi: '' })) }}
                  className={cn('w-full px-3 py-2 border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring cursor-pointer', formErrors.klasifikasi ? 'border-error' : 'border-border')}
                >
                  <option value="">Pilih Klasifikasi</option>
                  {klasifikasiList.map(k => <option key={k.id} value={k.nama}>{k.nama}</option>)}
                </select>
                {formErrors.klasifikasi && <p className="text-[10px] text-error mt-1">{formErrors.klasifikasi}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">Retensi Aktif <span className="text-error">*</span></label>
                  <select
                    value={retensiAktif}
                    onChange={e => setRetensiAktif(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    {RETENSI_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">Retensi Inaktif <span className="text-error">*</span></label>
                  <select
                    value={retensiInaktif}
                    onChange={e => setRetensiInaktif(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    {RETENSI_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">Masa Aktif Berakhir</label>
                  <input
                    type="date"
                    value={masaAktifBerakhir}
                    onChange={e => setMasaAktifBerakhir(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                    readOnly
                  />
                  {formErrors.masaAktifBerakhir && <p className="text-[10px] text-error mt-1">{formErrors.masaAktifBerakhir}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">Masa Inaktif Berakhir</label>
                  <input
                    type="date"
                    value={masaInaktifBerakhir}
                    onChange={e => setMasaInaktifBerakhir(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                    readOnly
                  />
                  {formErrors.masaInaktifBerakhir && <p className="text-[10px] text-error mt-1">{formErrors.masaInaktifBerakhir}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1.5">Catatan Arsiparis <span className="text-outline font-normal">(opsional)</span></label>
                <textarea
                  value={catatan}
                  onChange={e => setCatatan(e.target.value)}
                  placeholder="Catatan tambahan..."
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>

              {formSubmitError && (
                <div className="flex items-center gap-2 p-3 bg-error/5 border border-error/20 rounded-lg">
                  <AlertCircle size={14} className="text-error shrink-0" />
                  <p className="text-xs text-error">{formSubmitError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button className="flex-1 gap-1.5" onClick={handleArchive} disabled={!!formLoading}>
                  {formLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Terima
                </Button>
              </div>
            </div>
          </div>
        )}

        <Link to="/arsiparis/inbox">
          <Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Kembali</Button>
        </Link>
      </div>
    </PageLayout>
  )
}
