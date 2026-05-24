import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  FolderOpen, ChevronRight, AlertCircle, Loader2,
} from 'lucide-react'
import { ApiError, apiFetch } from '#/lib/api-client'
import { formatDate } from '#/lib/utils/format'

export const Route = createFileRoute('/arsiparis/aktif/')({ component: ArsipAktifPage })

type ArsipAktifItem = {
  id: string
  nomor_surat: string
  nama_arsip: string
  klasifikasi_arsip: string
  tanggal_arsip: string | null
  retensi_aktif: string
  retensi_inaktif: string
  masa_aktif_berakhir: string | null
  masa_inaktif_berakhir: string | null
  nominal_realisasi: string | number | null
  sumber: string
  jumlah_lampiran: number | null
  source_warnings: string[]
}

type ArsipAktifResponse = {
  aktif?: ArsipAktifItem[]
  error?: string
}

function ArsipAktifPage() {
  const [items, setItems] = useState<ArsipAktifItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const json = await apiFetch<ArsipAktifResponse>('/arsiparis/aktif')
      setItems(json.aktif ?? [])
    } catch (error) {
      if (error instanceof ApiError) {
        const payload = error.payload
        if (payload && typeof payload === 'object' && 'error' in payload) {
          setError(typeof payload.error === 'string' ? payload.error : 'Gagal')
        } else {
          setError('Gagal')
        }
      } else {
        setError('Terjadi kesalahan')
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])


  return (
    <PageLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
            <Link to="/arsiparis" className="hover:text-primary">Kepala Sub Bagian Umum</Link>
            <ChevronRight size={10} />
            <span className="text-primary">Daftar Arsip Aktif</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">Daftar Arsip Aktif</h2>
          <p className="text-on-surface-variant text-xs mt-1">{items.length} arsip dalam masa aktif.</p>
        </div>

        <div className="rounded-xl border border-dashed border-outline-variant/60 bg-surface-container-low/30 px-4 py-3 text-xs text-on-surface-variant">
          Pencarian dan filter lintas metadata ditunda. Halaman ini menampilkan daftar kanonis read-only berdasarkan status arsip.
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-primary" /></div>
        ) : error ? (
          <div className="flex flex-col items-center py-20 gap-4 bg-error/5 rounded-2xl border border-error/20">
            <AlertCircle size={32} className="text-error" /><p className="text-sm text-on-surface-variant">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-4 bg-white/5 rounded-2xl border border-white/10">
            <div className="w-14 h-14 rounded-xl bg-blue-500/10 flex items-center justify-center"><FolderOpen size={24} className="text-blue-500" /></div>
            <p className="font-headline text-lg font-bold text-on-surface">Tidak ada arsip aktif</p>
            <p className="text-on-surface-variant text-xs">Arsip dalam masa aktif akan muncul di sini.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-container-low/30 text-left">
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider w-10 text-center">No</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Nama Arsip</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Nomor Surat</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Klasifikasi Arsip</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Tanggal Arsip</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Retensi</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Masa Berakhir</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-right">Nominal Realisasi</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Sumber</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Lampiran</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a, i) => (
                    <tr key={a.id} className="border-t border-outline-variant/20 hover:bg-primary/5 transition-colors">
                      <td className="px-4 py-3 text-center text-outline">{i + 1}</td>
                      <td className="px-4 py-3 text-on-surface">
                        <p className="font-semibold line-clamp-1">{a.nama_arsip}</p>
                        {a.source_warnings.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {a.source_warnings.map((warning) => (
                              <Badge key={warning} className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                                {warning}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-on-surface">{a.nomor_surat}</td>
                      <td className="px-4 py-3 text-on-surface">{a.klasifikasi_arsip}</td>
                      <td className="px-4 py-3 text-center text-on-surface-variant">{formatNullableDate(a.tanggal_arsip)}</td>
                      <td className="px-4 py-3 text-on-surface">
                        <p>Aktif: {a.retensi_aktif}</p>
                        <p className="text-on-surface-variant">Inaktif: {a.retensi_inaktif}</p>
                      </td>
                      <td className="px-4 py-3 text-on-surface">
                        <p>Aktif: {formatNullableDate(a.masa_aktif_berakhir)}</p>
                        <p className="text-on-surface-variant">Inaktif: {formatNullableDate(a.masa_inaktif_berakhir)}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-on-surface">{formatNominal(a.nominal_realisasi)}</td>
                      <td className="px-4 py-3 text-center"><SourceBadge label={a.sumber} /></td>
                      <td className="px-4 py-3 text-center text-on-surface">{a.jumlah_lampiran ?? '-'}</td>
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

function SourceBadge({ label }: { label: string }) {
  const className = label === 'Arsip Manual'
    ? 'bg-sky-100 text-sky-700 border-sky-200 text-xs'
    : label === 'Dokumen Persetujuan'
      ? 'bg-emerald-100 text-emerald-700 border-emerald-200 text-xs'
      : 'bg-slate-100 text-slate-700 border-slate-200 text-xs'

  return <Badge className={className}>{label}</Badge>
}

function formatNullableDate(value: string | null): string {
  return value ? formatDate(value) : '-'
}

function formatNominal(value: string | number | null): string {
  if (value === null || value === '') return '-'
  const numericValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numericValue)) return String(value)

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(numericValue)
}
