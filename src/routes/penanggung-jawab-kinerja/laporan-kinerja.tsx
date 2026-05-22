import { createFileRoute } from '@tanstack/react-router'
import { BarChart3, ChevronRight, Inbox, ShieldX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { ApiError, apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/penanggung-jawab-kinerja/laporan-kinerja')({
  component: LaporanKinerjaPage,
})

type LaporanKinerjaRow = {
  id: string
  judul: string
  status: 'COMPLETED' | 'TERSIMPAN' | 'ARCHIVED'
  is_non_material: boolean
  fungsi_nama: string | null
  kegiatan_nama: string | null
  tahun: number
  tanggal: string
  pengaju_nama: string
  created_at: string
  updated_at: string
  nominal_realisasi: number | null
}

type LaporanKinerjaResponse = {
  dokumen?: LaporanKinerjaRow[]
  meta?: {
    limit: number
    final_statuses: Array<'COMPLETED' | 'TERSIMPAN' | 'ARCHIVED'>
  }
  error?: string
}

function LaporanKinerjaPage() {
  const [dokumen, setDokumen] = useState<LaporanKinerjaRow[]>([])
  const [limit, setLimit] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    apiFetch<LaporanKinerjaResponse>('/laporan/kinerja')
      .then((data) => {
        if (data.error) {
          setError(data.error)
          return
        }

        setDokumen(data.dokumen ?? [])
        setLimit(data.meta?.limit ?? null)
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          if (err.status === 403) {
            setForbidden(true)
            return
          }

          const payload = err.payload
          if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
            setError(payload.error)
            return
          }
        }

        setError('Gagal memuat data. Coba muat ulang halaman.')
      })
      .finally(() => setLoading(false))
  }, [])

  const totalNominalMaterial = useMemo(() => {
    return dokumen.reduce((total, row) => {
      if (row.is_non_material || row.nominal_realisasi === null) return total
      return total + row.nominal_realisasi
    }, 0)
  }, [dokumen])

  return (
    <PageLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
            <BarChart3 size={12} />
            <span>Laporan</span>
            <ChevronRight size={10} />
            <span className="text-primary">Laporan Kinerja</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">Laporan Kinerja</h2>
          <p className="text-on-surface-variant text-xs mt-1">
            Metadata dokumen final: COMPLETED, TERSIMPAN, dan ARCHIVED. Halaman ini tidak menyediakan akses file.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-on-surface-variant">Memuat data...</span>
            </div>
          </div>
        )}

        {!loading && forbidden && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="rounded-full bg-error/10 p-5">
              <ShieldX className="h-10 w-10 text-error/60" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-medium text-on-surface">Akses Ditolak</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Laporan Kinerja hanya dapat diakses oleh Penanggung Jawab Kinerja.
              </p>
            </div>
            <Button onClick={() => { window.location.href = '/' }}>
              Kembali ke Dashboard
            </Button>
          </div>
        )}

        {!loading && !forbidden && error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !forbidden && !error && dokumen.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-base font-medium text-muted-foreground">Belum ada dokumen final</p>
            <p className="text-sm text-muted-foreground/70">
              Dokumen final COMPLETED, TERSIMPAN, dan ARCHIVED akan muncul di sini.
            </p>
          </div>
        )}

        {!loading && !forbidden && !error && dokumen.length > 0 && (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <SummaryCard label="Dokumen Final" value={String(dokumen.length)} />
              <SummaryCard label="Dokumen Non-Material" value={String(dokumen.filter((row) => row.is_non_material).length)} />
              <SummaryCard
                label="Total Nominal Material"
                value={formatCurrency(totalNominalMaterial)}
              />
            </div>

            <div className="rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground w-8">No</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Dokumen</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Jenis</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fungsi</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kegiatan</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tahun</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Pengaju</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Nominal</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Diperbarui</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dokumen.map((row, idx) => (
                      <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{row.judul}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{shortId(row.id)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary">{row.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {row.is_non_material ? 'Non-Material' : 'Material'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{row.fungsi_nama ?? '-'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{row.kegiatan_nama ?? '-'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{row.tahun}</td>
                        <td className="px-4 py-3 text-muted-foreground">{row.pengaju_nama}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {row.is_non_material ? '-' : formatNullableCurrency(row.nominal_realisasi)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(row.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 border-t bg-muted/20 text-xs text-muted-foreground">
                Menampilkan {dokumen.length}{limit ? ` dari maksimal ${limit}` : ''} dokumen final. Akses detail, preview, download, dan ekspor tidak tersedia pada fondasi ini.
              </div>
            </div>
          </>
        )}
      </div>
    </PageLayout>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-extrabold text-on-surface">{value}</p>
    </div>
  )
}

function shortId(id: string) {
  return id.slice(0, 8)
}

function formatDate(value: string) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatNullableCurrency(value: number | null) {
  if (value === null) return '-'
  return formatCurrency(value)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}
