import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import {
  ChevronRight, AlertCircle, Loader2,
  Eye, X, Trash2, AlertTriangle,
} from 'lucide-react'
import type { LampiranUrl } from '#/lib/dokumen-helpers'
import { cn } from '#/lib/utils'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiFetch } from '#/lib/api-client'
import { apiMutation } from '#/lib/api-mutation'

export const Route = createFileRoute('/arsiparis/usul-musnah/$id')({ component: UsulMusnahDetailPage })

type DokumenChain = {
  id: string
  judul: string
  fungsi_nama: string
  kegiatan_nama: string
  jenis_permintaan: string
  kategori_permintaan: string
  detail_permintaan: string
  tahun: number
}

type Lamp = { nama: string; uploaded_at?: string }

type MusnahDetail = {
  musnah: {
    id: string
    arsip_id: string
    status: string
    catatan: string | null
    created_at: string
    diusulkan_oleh: string
    diusulkan_oleh_nama: string
  }
  arsip: {
    id: string
    nomor_surat: string
    klasifikasi: string
    retensi_aktif: string
    retensi_inaktif: string
    masa_aktif_berakhir: string
    masa_inaktif_berakhir: string
    status_arsip: string
    archived_at: string
    archived_by: string
    archived_by_nama: string
    dokumen_id: string
    lampiran_urls: LampiranUrl[]
    dokumen: DokumenChain | null
  }
}


function UsulMusnahDetailPage() {
  const { id }: { id: string } = Route.useParams()
  const [data, setData] = useState<MusnahDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [previewingIdx, setPreviewingIdx] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [id])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && previewingIdx !== null) closePreview() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [previewingIdx])

  async function fetchData() {
    setLoading(true); setFetchError(null)
    try {
      const json = await apiFetch<MusnahDetail>('/arsiparis/usul-musnah/' + id)
      setData(json)
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setFetchError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Usul musnah tidak ditemukan'
          : 'Usul musnah tidak ditemukan')
        return
      }

      setFetchError('Terjadi kesalahan saat mengambil data')
    }
    finally { setLoading(false) }
  }

  async function handleSetujuMusnah() {
    setActionLoading(true); setActionError(null)
    try {
      await apiMutation('/api/arsiparis/usul-musnah/' + id, {
        method: 'PATCH',
        body: { aksi: 'SETUJUI' },
      })
      window.location.href = '/arsiparis/usul-musnah'
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setActionError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        setActionLoading(false)
        return
      }

      setActionError('Terjadi kesalahan'); setActionLoading(false)
    }
  }

  async function handlePreview(index: number) {
    if (!data?.arsip.dokumen) return
    setPreviewingIdx(index); setPreviewUrl(null); setPreviewLoading(true); setPreviewError(null)
    try {
      const res = await fetch('/api/dokumen/' + data.arsip.dokumen.id + '/preview/' + index, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) { setPreviewError(json.error ?? 'Terjadi kesalahan'); setPreviewLoading(false); return }
      if (json.signedUrl) { setPreviewUrl(json.signedUrl); setPreviewFilename(json.filename ?? 'lampiran-' + (index + 1)) }
    } catch { setPreviewError('Terjadi kesalahan') }
    finally { setPreviewLoading(false) }
  }

  function closePreview() { setPreviewingIdx(null); setPreviewUrl(null); setPreviewFilename('') }

  const statusBadge = (status: string) => {
    if (status === 'MENUNGGU') return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">MENUNGGU</Badge>
    if (status === 'DISETUJUI') return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">DISETUJUI</Badge>
    return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">DITOLAK</Badge>
  }

  return (
    <PageLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {previewingIdx !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) closePreview() }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/30 shrink-0">
                <Eye size={16} className="text-primary shrink-0" />
                <p className="text-sm font-semibold text-on-surface truncate flex-1">{previewFilename}</p>
                <span className="text-[10px] text-outline hidden sm:block">ESC</span>
                <button onClick={closePreview} className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-surface-container-low transition-colors shrink-0"><X size={16} /></button>
              </div>
              <div className="flex-1 overflow-auto bg-surface-container-low/30">
                {previewLoading ? <div className="flex items-center justify-center h-48"><Loader2 size={22} className="animate-spin text-primary" /></div>
                 : previewUrl ? <iframe src={previewUrl} className="w-full h-[calc(70vh-96px)] border-0" title={previewFilename} />
                 : <div className="flex items-center justify-center h-48">
                     {previewError ? (
                       <div className="text-center px-4">
                         <p className="text-sm text-error font-semibold">File tidak tersedia</p>
                         <p className="text-xs text-on-surface-variant mt-1">{previewError}</p>
                       </div>
                     ) : (
                       <p className="text-sm text-on-surface-variant">Gagal memuat pratinjau.</p>
                     )}
                   </div>}
              </div>
            </div>
          </div>
        )}

        {confirmOpen && data && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) { setConfirmOpen(false); setActionError(null) } }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-error/20">
                <AlertTriangle size={18} className="text-error shrink-0" />
                <p className="font-semibold text-on-surface">Konfirmasi Pemusnahan</p>
              </div>
              <div className="p-5 space-y-4">
                <div className="p-3 bg-surface-container-low/30 rounded-lg">
                  <p className="text-xs font-semibold text-on-surface">{data.arsip.nomor_surat}</p>
                  <p className="text-xs text-on-surface-variant">{data.arsip.dokumen?.judul}</p>
                </div>
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-700 font-semibold">PERINGATAN: DESTRUKTIF</p>
                  <p className="text-xs text-red-600 mt-1">Arsip dan semua file lampirannya akan dihapus permanen dari sistem. Tindakan ini tidak dapat dibatalkan.</p>
                </div>
                {actionError && <p className="text-[10px] text-error">{actionError}</p>}
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => { setConfirmOpen(false); setActionError(null) }} disabled={!!actionLoading}>Batal</Button>
                  <Button className="flex-1 gap-1.5 bg-error hover:bg-error/90" onClick={handleSetujuMusnah} disabled={!!actionLoading}>
                    {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Ya, Musnahkan
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest">
          <Link to="/arsiparis" className="hover:text-primary">Arsiparis</Link>
          <ChevronRight size={10} />
          <Link to="/arsiparis/usul-musnah" className="hover:text-primary">Usul Musnah</Link>
          <ChevronRight size={10} />
          <span className="text-primary">Detail</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-primary" /></div>
        ) : fetchError || !data ? (
          <div className="text-center py-20">
            <AlertCircle size={32} className="text-error mx-auto mb-3" />
            <p className="text-sm text-on-surface-variant">{fetchError ?? "Usul musnah tidak ditemukan"}</p>
            <Link to="/arsiparis/usul-musnah"><Button variant="outline" size="sm" className="mt-4">Kembali</Button></Link>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-headline text-xl font-extrabold text-on-surface">{data.arsip.nomor_surat}</h2>
              <div className="flex items-center gap-2">
                <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">USUL MUSNAH</Badge>
                {statusBadge(data.musnah.status)}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
              <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Informasi Usul Musnah</p>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Diusulkan Oleh</p><p className="text-sm font-semibold text-on-surface">{data.musnah.diusulkan_oleh_nama}</p></div>
                <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tanggal Diusulkan</p><p className="text-sm font-semibold text-on-surface">{formatDate(data.musnah.created_at)}</p></div>
                {data.musnah.catatan && (
                  <div className="col-span-2"><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Catatan</p><p className="text-sm text-on-surface">{data.musnah.catatan}</p></div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
              <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Informasi Arsip</p>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Nomor Surat</p><p className="text-sm font-semibold text-on-surface">{data.arsip.nomor_surat}</p></div>
                <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Klasifikasi</p><p className="text-sm font-semibold text-on-surface">{data.arsip.klasifikasi}</p></div>
                <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Masa Aktif Berakhir</p><p className="text-sm font-semibold text-on-surface">{formatDate(data.arsip.masa_aktif_berakhir)}</p></div>
                <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Masa Inaktif Berakhir</p><p className="text-sm font-semibold text-on-surface">{formatDate(data.arsip.masa_inaktif_berakhir)}</p></div>
                <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tanggal Diarsipkan</p><p className="text-sm font-semibold text-on-surface">{formatDate(data.arsip.archived_at)}</p></div>
                <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Diarsipkan Oleh</p><p className="text-sm font-semibold text-on-surface">{data.arsip.archived_by_nama}</p></div>
              </div>
            </div>

            {data.arsip.dokumen && (
              <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
                <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Informasi Dokumen</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2"><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Judul</p><p className="text-sm font-semibold text-on-surface">{data.arsip.dokumen.judul}</p></div>
                  <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Fungsi</p><p className="text-sm font-semibold text-on-surface">{data.arsip.dokumen.fungsi_nama}</p></div>
                  <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kegiatan</p><p className="text-sm font-semibold text-on-surface">{data.arsip.dokumen.kegiatan_nama}</p></div>
                  <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Jenis Permintaan</p><p className="text-sm font-semibold text-on-surface">{data.arsip.dokumen.jenis_permintaan}</p></div>
                  <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kategori Permintaan</p><p className="text-sm font-semibold text-on-surface">{data.arsip.dokumen.kategori_permintaan}</p></div>
                  {data.arsip.dokumen.detail_permintaan && data.arsip.dokumen.detail_permintaan !== '—' && (
                    <div className="col-span-2"><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Detail Permintaan</p><p className="text-sm font-semibold text-on-surface">{data.arsip.dokumen.detail_permintaan}</p></div>
                  )}
                  <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tahun</p><p className="text-sm font-semibold text-on-surface">{data.arsip.dokumen.tahun}</p></div>
                </div>
              </div>
            )}

            {data.arsip.lampiran_urls.length > 0 && (
              <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
                <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Lampiran ({data.arsip.lampiran_urls.length})</p>
                <div className="space-y-2">
                  {data.arsip.lampiran_urls.map((lamp: LampiranUrl, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-surface-container-low/20 rounded-lg">
                      <Eye size={16} className="text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-on-surface truncate">{lamp.nama}</p>
                        <p className="text-[10px] text-outline">{lamp.uploaded_at ? formatDate(lamp.uploaded_at) : ""}</p>
                      </div>
                      <Button size="icon-xs" variant="ghost" onClick={() => handlePreview(i)} aria-label="Pratinjau">
                        {previewingIdx === i ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.arsip.dokumen && (
              <ActivityLog dokumenId={data.arsip.dokumen.id} />
            )}

            {data.musnah.status === 'MENUNGGU' && (
              <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
                <p className="text-xs font-bold text-outline uppercase tracking-widest mb-4">Aksi</p>
                <Button className="w-full gap-1.5 bg-error hover:bg-error/90" onClick={() => setConfirmOpen(true)}>
                  <Trash2 size={14} />Setuju Musnah
                </Button>
              </div>
            )}

            {data.musnah.status !== 'MENUNGGU' && (
              <div className="bg-surface-container-low/20 rounded-xl border border-outline-variant/30 p-5 text-center">
                <p className="text-sm text-on-surface-variant">Usul musnah ini sudah diputuskan.</p>
              </div>
            )}

            <Link to="/arsiparis/usul-musnah">
              <Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Kembali</Button>
            </Link>
          </>
        )}
      </div>
    </PageLayout>
  )
}
