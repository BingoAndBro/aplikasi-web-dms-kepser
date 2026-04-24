import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  Archive, ChevronRight, AlertCircle, Loader2,
  FileText, Download, Eye, X,
} from 'lucide-react'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

export const Route = createFileRoute('/arsip/id/')({ component: ArsipDetailPage })

type ArsipDetail = {
  id: string
  nomor_surat: string
  klasifikasi: string
  retensi_aktif: string
  retensi_inaktif: string
  masa_aktif_berakhir: string
  masa_inaktif_berakhir: string
  status_arsip: string
  archived_at: string
  archived_by_nama: string
  catatan_arsiparis: string | null
  dokumen: {
    id: string
    judul: string
    fungsi: { id: string; nama: string }
    kegiatan: { id: string; nama: string }
    tahun: number
    lampiran_urls: LampiranUrl[]
  }
}

function ArsipDetailPage() {
  const { id } = Route.useParams()
  const [arsip, setArsip] = useState<ArsipDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

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
      const res = await fetch(`/api/arsip/id/?id=${id}`, { credentials: 'include' })
      if (!res.ok) {
        const json = await res.json()
        setFetchError(json.error ?? 'Arsip tidak ditemukan')
        setLoading(false); return
      }
      const json = await res.json()
      setArsip(json.arsip)
    } catch { setFetchError('Terjadi kesalahan saat mengambil data') }
    finally { setLoading(false) }
  }

  async function handlePreview(index: number) {
    setPreviewingIdx(index); setPreviewUrl(null); setPreviewLoading(true)
    try {
      const res = await fetch(`/api/dokumen/${arsip!.dokumen.id}/preview/${index}`, { credentials: 'include' })
      const json = await res.json()
      if (json.signedUrl) { setPreviewUrl(json.signedUrl); setPreviewFilename(json.filename ?? `lampiran-${index + 1}`) }
    } catch { /* silent */ }
    finally { setPreviewLoading(false) }
  }

  function closePreview() { setPreviewingIdx(null); setPreviewUrl(null); setPreviewFilename('') }

  function formatDate(str: string) {
    try { return new Date(str).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return str }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      AKTIF: { label: 'Aktif', className: 'bg-green-100 text-green-700 border-green-200' },
      INAKTIF: { label: 'Inaktif', className: 'bg-orange-100 text-orange-700 border-orange-200' },
      VERIFIKASI_PENYUSUTAN: { label: 'Verifikasi Penyusutan', className: 'bg-amber-100 text-amber-700 border-amber-200' },
      USUL_MUSNAH: { label: 'Usul Musnah', className: 'bg-red-100 text-red-700 border-red-200' },
    }
    const info = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-700 border-gray-200' }
    return <Badge className={`${info.className} text-xs`}>{info.label}</Badge>
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-primary" /></div>
  )

  if (fetchError || !arsip) return (
    <div className="text-center py-20">
      <AlertCircle size={32} className="text-error mx-auto mb-3" />
      <p className="text-sm text-on-surface-variant">{fetchError ?? 'Arsip tidak ditemukan'}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={() => window.location.href = '/arsip'}>Kembali</Button>
    </div>
  )

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

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest">
          <Link to="/arsip" className="hover:text-primary">Cari Arsip</Link>
          <ChevronRight size={10} />
          <span className="text-primary">{arsip.nomor_surat}</span>
        </div>

        <h2 className="font-headline text-xl font-extrabold text-on-surface">{arsip.nomor_surat}</h2>

        <div className="flex items-center gap-3">
          {statusBadge(arsip.status_arsip)}
        </div>

        {/* Metadata */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Informasi Arsip</p>
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Nomor Surat</p><p className="text-sm font-semibold text-on-surface">{arsip.nomor_surat}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Klasifikasi</p><p className="text-sm font-semibold text-on-surface">{arsip.klasifikasi}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Retensi Aktif</p><p className="text-sm font-semibold text-on-surface">{arsip.retensi_aktif}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Retensi Inaktif</p><p className="text-sm font-semibold text-on-surface">{arsip.retensi_inaktif}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Masa Aktif Berakhir</p><p className="text-sm font-semibold text-on-surface">{formatDate(arsip.masa_aktif_berakhir)}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Masa Inaktif Berakhir</p><p className="text-sm font-semibold text-on-surface">{formatDate(arsip.masa_inaktif_berakhir)}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tanggal Diarsipkan</p><p className="text-sm font-semibold text-on-surface">{formatDate(arsip.archived_at)}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Diarsipkan Oleh</p><p className="text-sm font-semibold text-on-surface">{arsip.archived_by_nama}</p></div>
            {arsip.catatan_arsiparis && (
              <div className="col-span-2"><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Catatan Arsiparis</p><p className="text-sm text-on-surface">{arsip.catatan_arsiparis}</p></div>
            )}
          </div>
        </div>

        {/* Dokumen Info */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Informasi Dokumen</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Judul</p><p className="text-sm font-semibold text-on-surface">{arsip.dokumen.judul}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Fungsi</p><p className="text-sm font-semibold text-on-surface">{arsip.dokumen.fungsi.nama}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kegiatan</p><p className="text-sm font-semibold text-on-surface">{arsip.dokumen.kegiatan.nama}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tahun</p><p className="text-sm font-semibold text-on-surface">{arsip.dokumen.tahun}</p></div>
          </div>
        </div>

        {/* Lampiran */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Lampiran ({arsip.dokumen.lampiran_urls.length})</p>
          {arsip.dokumen.lampiran_urls.length === 0 ? (
            <p className="text-xs text-on-surface-variant text-center py-4">Tidak ada lampiran.</p>
          ) : (
            <div className="space-y-2">
              {arsip.dokumen.lampiran_urls.map((lamp, i) => (
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
                    fetch(`/api/dokumen/${arsip!.dokumen.id}/download/${i}`, { credentials: 'include' })
                      .then(r => r.json())
                      .then(d => d.signedUrl && window.open(d.signedUrl, '_blank'))
                      .catch(() => alert('Gagal download'))
                  }} aria-label="Download"><Download size={14} /></Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Back */}
        <Link to="/arsip">
          <Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Kembali</Button>
        </Link>
      </div>
    </PageLayout>
  )
}
