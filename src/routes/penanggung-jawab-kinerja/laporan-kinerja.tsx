import { createFileRoute } from '@tanstack/react-router'
import {
  Archive,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  FileText,
  Inbox,
  Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import {
  KinerjaMobileCard,
  KinerjaMobileList,
  KinerjaNotice,
  KinerjaPageHeader,
  KinerjaPanel,
  KinerjaSearchPanel,
  KinerjaSummaryCard,
  KinerjaTableShell,
} from '#/components/kinerja/KinerjaPagePrimitives'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { StatusBadge } from '#/components/ui/StatusBadge'
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

type StatusFilter = 'ALL' | LaporanKinerjaRow['status']
type JenisFilter = 'ALL' | 'MATERIAL' | 'NON_MATERIAL'

function LaporanKinerjaPage() {
  const [dokumen, setDokumen] = useState<LaporanKinerjaRow[]>([])
  const [limit, setLimit] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [jenisFilter, setJenisFilter] = useState<JenisFilter>('ALL')

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

  const totalNominalRealisasi = useMemo(() => {
    return dokumen.reduce((total, row) => {
      if (row.is_non_material || row.nominal_realisasi === null) return total
      return total + row.nominal_realisasi
    }, 0)
  }, [dokumen])

  const statusCounts = useMemo(() => {
    return dokumen.reduce(
      (counts, row) => {
        counts[row.status] += 1
        return counts
      },
      { COMPLETED: 0, TERSIMPAN: 0, ARCHIVED: 0 } satisfies Record<LaporanKinerjaRow['status'], number>,
    )
  }, [dokumen])

  const filteredDokumen = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return dokumen.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false
      if (jenisFilter === 'MATERIAL' && row.is_non_material) return false
      if (jenisFilter === 'NON_MATERIAL' && !row.is_non_material) return false

      if (!normalizedSearch) return true

      return [
        row.judul,
        row.fungsi_nama,
        row.kegiatan_nama,
        row.pengaju_nama,
        String(row.tahun),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch))
    })
  }, [dokumen, jenisFilter, search, statusFilter])

  return (
    <PageLayout>
      <div className="space-y-6">
        <KinerjaPageHeader
          eyebrow={
            <>
              <span>Penanggung Jawab Kinerja</span>
              <ChevronRight size={10} />
              <span className="text-orange-800">Laporan Kinerja</span>
            </>
          }
          title="Laporan Kinerja"
          description="Pantau metadata dokumen final untuk kinerja organisasi. Akses ini terbatas pada metadata dokumen dengan status Selesai, Tersimpan, dan Diarsipkan."
        />

        <KinerjaNotice>
          Laporan Kinerja bersifat metadata-only. Halaman ini tidak menyediakan preview, download, lampiran,
          file URL, signed URL, atau aksi lifecycle arsip.
        </KinerjaNotice>

        {loading && <LoadingState label="Memuat Laporan Kinerja" rows={5} />}

        {!loading && forbidden && (
          <ErrorState
            title="Akses Ditolak"
            description="Laporan Kinerja hanya dapat diakses oleh Penanggung Jawab Kinerja yang ditetapkan melalui otorisasi server."
            variant="page"
            action={
              <Button onClick={() => { window.location.href = '/' }}>
                Kembali ke Dashboard
              </Button>
            }
          />
        )}

        {!loading && !forbidden && error && (
          <ErrorState
            title="Gagal memuat Laporan Kinerja"
            description={error}
            variant="destructive"
          />
        )}

        {!loading && !forbidden && !error && dokumen.length === 0 && (
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title="Belum ada dokumen final"
            description="Dokumen final dengan status Selesai, Tersimpan, dan Diarsipkan akan muncul di sini sebagai metadata Laporan Kinerja."
          />
        )}

        {!loading && !forbidden && !error && dokumen.length > 0 && (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <KinerjaSummaryCard
                icon={<FileText size={18} />}
                label="Total Dokumen Final"
                value={dokumen.length}
                helper="Status final yang diterima dari endpoint Laporan Kinerja."
              />
              <KinerjaSummaryCard
                icon={<Wallet size={18} />}
                label="Total Nominal Realisasi"
                value={formatCurrency(totalNominalRealisasi)}
                helper="Dihitung dari dokumen material dengan nominal realisasi."
                emphasis
              />
              <KinerjaSummaryCard
                icon={<CheckCircle2 size={18} />}
                label="Dokumen Selesai"
                value={statusCounts.COMPLETED}
                helper="Dokumen final dengan status Selesai."
              />
              <KinerjaSummaryCard
                icon={<Archive size={18} />}
                label="Tersimpan / Diarsipkan"
                value={`${statusCounts.TERSIMPAN} / ${statusCounts.ARCHIVED}`}
                helper="Distribusi dokumen tersimpan dan dokumen diarsipkan."
              />
            </div>

            <KinerjaPanel>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-orange-700/70">
                    <BarChart3 size={12} />
                    <span>Distribusi Status Final</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                    Ringkasan ini memakai data yang sama dengan tabel metadata di bawah.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusPill label="Selesai" value={statusCounts.COMPLETED} />
                  <StatusPill label="Tersimpan" value={statusCounts.TERSIMPAN} />
                  <StatusPill label="Diarsipkan" value={statusCounts.ARCHIVED} />
                </div>
              </div>
            </KinerjaPanel>

            <KinerjaSearchPanel
              id="laporan-kinerja-search"
              label="Cari dokumen Laporan Kinerja"
              value={search}
              onChange={setSearch}
              placeholder="Cari judul, fungsi, kegiatan, pengaju, atau tahun..."
              resultText={`${filteredDokumen.length} dari ${dokumen.length} dokumen`}
              helperText="Filter ini berjalan lokal pada metadata yang sudah diterima dari API. Tidak ada endpoint pencarian atau akses file baru."
            >
              <label className="min-w-[10rem]">
                <span className="sr-only">Filter status dokumen</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                  className="h-10 w-full rounded-xl border border-orange-100 bg-[#FFFDF9] px-3 text-sm font-semibold text-zinc-800 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="COMPLETED">Selesai</option>
                  <option value="TERSIMPAN">Tersimpan</option>
                  <option value="ARCHIVED">Diarsipkan</option>
                </select>
              </label>
              <label className="min-w-[10rem]">
                <span className="sr-only">Filter jenis dokumen</span>
                <select
                  value={jenisFilter}
                  onChange={(event) => setJenisFilter(event.target.value as JenisFilter)}
                  className="h-10 w-full rounded-xl border border-orange-100 bg-[#FFFDF9] px-3 text-sm font-semibold text-zinc-800 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70"
                >
                  <option value="ALL">Semua Jenis</option>
                  <option value="MATERIAL">Material</option>
                  <option value="NON_MATERIAL">Non-Material</option>
                </select>
              </label>
            </KinerjaSearchPanel>

            {filteredDokumen.length === 0 ? (
              <EmptyState
                icon={<Inbox className="h-5 w-5" />}
                title="Tidak ada dokumen sesuai filter"
                description="Sesuaikan kata kunci, status, atau jenis dokumen untuk melihat metadata final lain."
                compact
              />
            ) : (
              <>
                <KinerjaTableShell>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-orange-100 bg-[#FFF8F1]">
                        <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">
                          No
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">
                          Dokumen
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">
                          Jenis
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">
                          Fungsi / Kegiatan
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">
                          Tahun
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">
                          Pengaju
                        </th>
                        <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">
                          Nominal
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">
                          Diperbarui
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-orange-50">
                      {filteredDokumen.map((row, idx) => (
                        <tr key={row.id} className="transition-colors hover:bg-orange-50/40">
                          <td className="px-4 py-3 text-zinc-500">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <div className="max-w-xs font-semibold text-zinc-950">{row.judul}</div>
                            <div className="mt-0.5 text-xs text-zinc-500">
                              Tanggal dokumen: {formatDate(row.tanggal)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={row.status} />
                          </td>
                          <td className="px-4 py-3 text-zinc-600">
                            {formatJenis(row)}
                          </td>
                          <td className="px-4 py-3 text-zinc-600">
                            <div className="font-semibold text-zinc-800">{row.fungsi_nama ?? '-'}</div>
                            <div className="mt-0.5 text-xs text-zinc-500">{row.kegiatan_nama ?? '-'}</div>
                          </td>
                          <td className="px-4 py-3 text-zinc-600">{row.tahun}</td>
                          <td className="px-4 py-3 text-zinc-600">{row.pengaju_nama}</td>
                          <td className="px-4 py-3 text-right font-semibold text-zinc-700">
                            {row.is_non_material ? '-' : formatNullableCurrency(row.nominal_realisasi)}
                          </td>
                          <td className="px-4 py-3 text-zinc-600">{formatDate(row.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="border-t border-orange-100 bg-[#FFFDF9] px-4 py-2.5 text-xs leading-relaxed text-zinc-600">
                    Menampilkan {filteredDokumen.length}{limit ? ` dari maksimal ${limit}` : ''} dokumen final.
                    Tidak ada aksi detail, preview, download, lampiran, atau ekspor pada halaman ini.
                  </div>
                </KinerjaTableShell>

                <KinerjaMobileList>
                  {filteredDokumen.map((row) => (
                    <KinerjaMobileCard
                      key={row.id}
                      title={row.judul}
                      subtitle={`Tanggal dokumen: ${formatDate(row.tanggal)}`}
                      status={<StatusBadge status={row.status} />}
                      meta={[
                        { label: 'Jenis', value: formatJenis(row) },
                        { label: 'Fungsi', value: row.fungsi_nama ?? '-' },
                        { label: 'Kegiatan', value: row.kegiatan_nama ?? '-' },
                        { label: 'Tahun', value: row.tahun },
                        { label: 'Pengaju', value: row.pengaju_nama },
                        {
                          label: 'Nominal',
                          value: row.is_non_material ? '-' : formatNullableCurrency(row.nominal_realisasi),
                        },
                        { label: 'Diperbarui', value: formatDate(row.updated_at) },
                      ]}
                    />
                  ))}
                  <div className="rounded-2xl border border-orange-100 bg-[#FFFDF9] px-4 py-3 text-xs leading-relaxed text-zinc-600">
                    Menampilkan {filteredDokumen.length}{limit ? ` dari maksimal ${limit}` : ''} dokumen final.
                    Tidak ada aksi detail, preview, download, lampiran, atau ekspor pada halaman ini.
                  </div>
                </KinerjaMobileList>
              </>
            )}
          </>
        )}
      </div>
    </PageLayout>
  )
}

function StatusPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-full border border-orange-100 bg-[#FFFDF9] px-3 py-1.5 text-xs font-semibold text-zinc-700">
      <span className="text-zinc-500">{label}</span>
      <span className="ml-2 font-black text-zinc-950">{value}</span>
    </div>
  )
}

function formatJenis(row: LaporanKinerjaRow) {
  return row.is_non_material ? 'Non-Material' : 'Material'
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
