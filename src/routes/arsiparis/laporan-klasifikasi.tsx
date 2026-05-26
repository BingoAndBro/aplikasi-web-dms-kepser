import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  AlertCircle,
  BarChart3,
  ChevronRight,
  Loader2,
} from 'lucide-react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { ApiError, apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/arsiparis/laporan-klasifikasi')({
  component: LaporanKlasifikasiArsipPage,
})

type ClassificationReportRow = {
  klasifikasiId: string | null
  klasifikasiKode: string
  klasifikasiNama: string
  totalArsip: number
  totalWorkflow: number
  totalManual: number
  totalAktif: number
  totalInaktif: number
  totalUsulMusnah: number
  totalDimusnahkan: number
  totalNominalRealisasi: string
}

type ClassificationReportResponse = {
  report?: {
    rows: ClassificationReportRow[]
    totals: {
      totalArsip: number
      totalWorkflow: number
      totalManual: number
      totalNominalRealisasi: string
    }
  }
  error?: string
}

function LaporanKlasifikasiArsipPage() {
  const [report, setReport] = useState<NonNullable<ClassificationReportResponse['report']> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchReport() {
    setLoading(true)
    setError(null)

    try {
      const json = await apiFetch<ClassificationReportResponse>('/arsiparis/arsip/classification-report')
      setReport(json.report ?? null)
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
    fetchReport()
  }, [])

  const totals = report?.totals ?? {
    totalArsip: 0,
    totalWorkflow: 0,
    totalManual: 0,
    totalNominalRealisasi: '0.00',
  }
  const rows = report?.rows ?? []

  return (
    <PageLayout>
      <div className="space-y-6">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest">
            <Link to="/arsiparis" className="hover:text-primary">Kepala Sub Bagian Umum</Link>
            <ChevronRight size={10} />
            <span className="text-primary">Laporan Klasifikasi Arsip</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">Laporan Klasifikasi Arsip</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            Ringkasan jumlah arsip dan nominal realisasi berdasarkan klasifikasi.
          </p>
        </div>

        <div className="rounded-xl border border-dashed border-outline-variant/60 bg-surface-container-low/30 px-4 py-3 text-xs text-on-surface-variant">
          Nominal realisasi dihitung dari arsip workflow/material. Arsip manual tidak menambah nominal.
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Total Arsip" value={formatCount(totals.totalArsip)} />
          <SummaryCard label="Total Workflow" value={formatCount(totals.totalWorkflow)} />
          <SummaryCard label="Total Manual" value={formatCount(totals.totalManual)} />
          <SummaryCard label="Total Nominal Realisasi" value={formatCurrency(totals.totalNominalRealisasi)} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-error/20 bg-error/5 py-20">
            <AlertCircle size={32} className="text-error" />
            <p className="text-sm text-on-surface-variant">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchReport}>Coba Lagi</Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-500/10">
              <BarChart3 size={24} className="text-blue-500" />
            </div>
            <p className="font-headline text-lg font-bold text-on-surface">Belum ada data klasifikasi</p>
            <p className="text-xs text-on-surface-variant">Arsip kanonis akan diringkas di sini setelah tersedia.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-container-low/30 text-left">
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Kode Klasifikasi</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Nama Klasifikasi</th>
                    <th className="px-4 py-3 text-right font-semibold text-outline uppercase tracking-wider">Total Arsip</th>
                    <th className="px-4 py-3 text-right font-semibold text-outline uppercase tracking-wider">Workflow</th>
                    <th className="px-4 py-3 text-right font-semibold text-outline uppercase tracking-wider">Manual</th>
                    <th className="px-4 py-3 text-right font-semibold text-outline uppercase tracking-wider">Aktif</th>
                    <th className="px-4 py-3 text-right font-semibold text-outline uppercase tracking-wider">Inaktif</th>
                    <th className="px-4 py-3 text-right font-semibold text-outline uppercase tracking-wider">Usul Musnah</th>
                    <th className="px-4 py-3 text-right font-semibold text-outline uppercase tracking-wider">Dimusnahkan</th>
                    <th className="px-4 py-3 text-right font-semibold text-outline uppercase tracking-wider">Total Nominal Realisasi</th>
                    <th className="px-4 py-3 text-center font-semibold text-outline uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.klasifikasiId ?? 'missing'}-${row.klasifikasiKode}-${row.klasifikasiNama}`} className="border-t border-outline-variant/20 hover:bg-primary/5">
                      <td className="px-4 py-3 font-semibold text-on-surface">{row.klasifikasiKode}</td>
                      <td className="px-4 py-3 text-on-surface">{row.klasifikasiNama}</td>
                      <td className="px-4 py-3 text-right text-on-surface">{formatCount(row.totalArsip)}</td>
                      <td className="px-4 py-3 text-right text-on-surface">{formatCount(row.totalWorkflow)}</td>
                      <td className="px-4 py-3 text-right text-on-surface">{formatCount(row.totalManual)}</td>
                      <td className="px-4 py-3 text-right text-on-surface">{formatCount(row.totalAktif)}</td>
                      <td className="px-4 py-3 text-right text-on-surface">{formatCount(row.totalInaktif)}</td>
                      <td className="px-4 py-3 text-right text-on-surface">{formatCount(row.totalUsulMusnah)}</td>
                      <td className="px-4 py-3 text-right text-on-surface">{formatCount(row.totalDimusnahkan)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-on-surface">{formatCurrency(row.totalNominalRealisasi)}</td>
                      <td className="px-4 py-3 text-center">
                        <a
                          href={getClassificationDetailHref(row)}
                          className="inline-flex h-7 items-center rounded-lg border border-outline-variant/40 px-2.5 text-[11px] font-semibold text-primary hover:bg-primary/5"
                        >
                          Detail
                        </a>
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold text-outline uppercase tracking-wider">{label}</p>
      <p className="mt-2 text-xl font-extrabold text-on-surface">{value}</p>
    </div>
  )
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

function getClassificationDetailHref(row: ClassificationReportRow): string {
  if (row.klasifikasiId) {
    return `/arsiparis/laporan-klasifikasi/detail?klasifikasiId=${encodeURIComponent(row.klasifikasiId)}`
  }

  return '/arsiparis/laporan-klasifikasi/detail?missing=true'
}
