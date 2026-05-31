import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  FileSearch,
  Loader2,
} from 'lucide-react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { ApiError, apiFetch } from '#/lib/api-client'
import { formatDate } from '#/lib/utils/format'

export const Route = createFileRoute('/arsiparis/laporan-klasifikasi_/detail')({
  validateSearch: z.object({
    klasifikasiId: z.string().optional(),
    missing: z.string().optional(),
  }),
  component: LaporanKlasifikasiDetailPage,
})

type ClassificationDetailItem = {
  id: string
  namaArsip: string
  nomorSurat: string | null
  statusArsip: string
  sourceType: 'WORKFLOW' | 'MANUAL'
  tanggalArsip: string | null
  nominalRealisasi: string | null
  jumlahLampiran: number
}

type ClassificationDetailResponse = {
  classification: {
    klasifikasiId: string | null
    klasifikasiKode: string
    klasifikasiNama: string
  }
  items: ClassificationDetailItem[]
  summary: {
    totalBerkas: number
    totalArsip: number
    totalWorkflow: number
    totalManual: number
    totalNominalRealisasi: string
  }
  error?: string
}

function LaporanKlasifikasiDetailPage() {
  const search = Route.useSearch()
  const [detail, setDetail] = useState<ClassificationDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchDetail() {
    setLoading(true)
    setError(null)

    const isMissing = search.missing === 'true'
    const klasifikasiId = search.klasifikasiId?.trim()
    if (!klasifikasiId && !isMissing) {
      setDetail(null)
      setError('Parameter klasifikasi tidak valid')
      setLoading(false)
      return
    }

    try {
      const json = await apiFetch<ClassificationDetailResponse>('/arsiparis/arsip/classification-report-detail', {
        query: {
          klasifikasiId: klasifikasiId || undefined,
          missing: isMissing ? true : undefined,
        },
      })
      setDetail(json)
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
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDetail()
  }, [search.klasifikasiId, search.missing])

  const classification = detail?.classification ?? {
    klasifikasiId: null,
    klasifikasiKode: 'Tidak tersedia',
    klasifikasiNama: 'Tidak tersedia',
  }
  const summary = detail?.summary ?? {
    totalBerkas: 0,
    totalArsip: 0,
    totalWorkflow: 0,
    totalManual: 0,
    totalNominalRealisasi: '0.00',
  }
  const items = detail?.items ?? []

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest">
              <Link to="/arsiparis" className="hover:text-primary">Kepala Sub Bagian Umum</Link>
              <ChevronRight size={10} />
              <Link to="/arsiparis/laporan-klasifikasi" className="hover:text-primary">Laporan Klasifikasi Arsip</Link>
              <ChevronRight size={10} />
              <span className="text-primary">Detail Klasifikasi</span>
            </div>
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Daftar Arsip Klasifikasi</h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              Daftar ini menampilkan dokumen dalam berkas arsip folder-first. Aksi akses file tidak ditampilkan di halaman ini.
            </p>
          </div>
          <Link
            to="/arsiparis/laporan-klasifikasi"
            className="inline-flex h-9 w-fit items-center gap-1.5 rounded-lg border border-outline-variant/40 px-3 text-xs font-semibold text-on-surface hover:bg-primary/5"
          >
            <ArrowLeft size={14} />
            Kembali
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <InfoCard label="Kode Klasifikasi" value={classification.klasifikasiKode} />
          <InfoCard label="Nama Klasifikasi" value={classification.klasifikasiNama} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Total Berkas" value={formatCount(summary.totalBerkas)} />
          <SummaryCard label="Total Dokumen" value={formatCount(summary.totalArsip)} />
          <SummaryCard label="Workflow" value={formatCount(summary.totalWorkflow)} />
          <SummaryCard label="Manual" value={formatCount(summary.totalManual)} />
        </div>
        <SummaryCard label="Total Nominal Realisasi" value={formatCurrency(summary.totalNominalRealisasi)} />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-error/20 bg-error/5 py-20">
            <AlertCircle size={32} className="text-error" />
            <p className="text-sm text-on-surface-variant">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchDetail}>Coba Lagi</Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-500/10">
              <FileSearch size={24} className="text-blue-500" />
            </div>
            <p className="font-headline text-lg font-bold text-on-surface">Tidak ada arsip dalam klasifikasi ini</p>
            <p className="text-xs text-on-surface-variant">Dokumen berkas akan muncul di sini jika tersedia.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-container-low/30 text-left">
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Nama Arsip</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Nomor Surat</th>
                    <th className="px-4 py-3 text-center font-semibold text-outline uppercase tracking-wider">Status Arsip</th>
                    <th className="px-4 py-3 text-center font-semibold text-outline uppercase tracking-wider">Sumber Arsip</th>
                    <th className="px-4 py-3 text-center font-semibold text-outline uppercase tracking-wider">Tanggal Arsip</th>
                    <th className="px-4 py-3 text-right font-semibold text-outline uppercase tracking-wider">Nominal Realisasi</th>
                    <th className="px-4 py-3 text-center font-semibold text-outline uppercase tracking-wider">Jumlah Lampiran</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-outline-variant/20 hover:bg-primary/5">
                      <td className="px-4 py-3 font-semibold text-on-surface">{item.namaArsip}</td>
                      <td className="px-4 py-3 text-on-surface">{item.nomorSurat ?? '-'}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={item.statusArsip} /></td>
                      <td className="px-4 py-3 text-center"><SourceBadge sourceType={item.sourceType} /></td>
                      <td className="px-4 py-3 text-center text-on-surface-variant">{formatNullableDate(item.tanggalArsip)}</td>
                      <td className="px-4 py-3 text-right text-on-surface">{formatNullableCurrency(item.nominalRealisasi)}</td>
                      <td className="px-4 py-3 text-center text-on-surface">{formatCount(item.jumlahLampiran)}</td>
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

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold text-outline uppercase tracking-wider">{label}</p>
      <p className="mt-2 text-sm font-bold text-on-surface">{value}</p>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold text-outline uppercase tracking-wider">{label}</p>
      <p className="mt-2 text-xl font-extrabold text-on-surface">{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const className = status === 'AKTIF'
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200 text-xs'
    : status === 'OPEN'
      ? 'bg-blue-100 text-blue-700 border-blue-200 text-xs'
    : status === 'INAKTIF'
      ? 'bg-slate-100 text-slate-700 border-slate-200 text-xs'
      : status === 'USUL_MUSNAH'
        ? 'bg-amber-100 text-amber-700 border-amber-200 text-xs'
        : 'bg-red-100 text-red-700 border-red-200 text-xs'

  return <Badge className={className}>{formatStatus(status)}</Badge>
}

function SourceBadge({ sourceType }: { sourceType: 'WORKFLOW' | 'MANUAL' }) {
  const className = sourceType === 'MANUAL'
    ? 'bg-sky-100 text-sky-700 border-sky-200 text-xs'
    : 'bg-emerald-100 text-emerald-700 border-emerald-200 text-xs'

  return <Badge className={className}>{sourceType === 'MANUAL' ? 'Arsip Manual' : 'Dokumen Persetujuan'}</Badge>
}

function formatStatus(status: string): string {
  if (status === 'OPEN') return 'Berkas Terbuka'
  if (status === 'BELUM_FINAL') return 'Belum Final'
  if (status === 'AKTIF') return 'Aktif'
  if (status === 'INAKTIF') return 'Inaktif'
  if (status === 'USUL_MUSNAH') return 'Usul Musnah'
  if (status === 'DIMUSNAHKAN') return 'Dimusnahkan'

  return status
}

function formatNullableDate(value: string | null): string {
  return value ? formatDate(value) : '-'
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value)
}

function formatCurrency(value: string): string {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return 'Rp0'

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(numericValue)
}

function formatNullableCurrency(value: string | null): string {
  return value ? formatCurrency(value) : '-'
}
