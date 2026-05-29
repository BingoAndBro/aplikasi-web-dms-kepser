import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  Search,
  FileText,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  FileEdit,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiFetch } from '#/lib/api-client'

type Item = {
  id: string; judul: string; fungsi_nama: string; kegiatan_nama: string
  status: string; current_step: string | null; revision_target: string | null
  tahun: number; tanggal: string; created_at: string; updated_at: string; revision_notes: string | null
}

export const Route = createFileRoute('/pegawai/revisi')({
  preload: false,
  component: PegawaiRevisiPage,
})

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost'; className?: string }> = {
  DRAFT: {
    label: 'Draf',
    variant: 'outline',
    className: 'border-outline text-outline',
  },
  IN_PPK_VALIDATION: {
    label: 'Validasi PPK',
    variant: 'secondary',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  IN_BENDAHARA_APPROVAL: {
    label: 'Persetujuan PPSPM',
    variant: 'secondary',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  NEED_REVISION: {
    label: 'Perlu Revisi',
    variant: 'destructive',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  COMPLETED: {
    label: 'Selesai',
    variant: 'secondary',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  ARCHIVED: {
    label: 'Diarsipkan',
    variant: 'outline',
    className: 'border-outline text-outline/60',
  },
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: 'outline' as const, className: '' }
  return (
    <Badge
      variant={config.variant}
      className={cn('text-[10px] font-semibold px-2 py-0.5', config.className)}
    >
      {config.label}
    </Badge>
  )
}

function StepBadge({ step }: { step: string | null }) {
  if (!step) return null
  const label = step === 'PPK' ? 'Step 1: PPK' : 'Step 2: PPSPM'
  return (
    <span className="text-[10px] text-on-surface-variant bg-surface-container-low px-1.5 py-0.5 rounded">
      {label}
    </span>
  )
}

const PAGE_SIZE = 10

function PegawaiRevisiPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    apiFetch<{ dokumen?: Item[] }>('/pegawai/revisi')
      .then(d => { setItems(d.dokumen ?? []); setLoading(false) })
      .catch((err) => {
        if (err instanceof ApiError) {
          const payload = err.payload
          setItems(payload && typeof payload === 'object' && 'dokumen' in payload
            ? (payload as { dokumen?: Item[] }).dokumen ?? []
            : [])
          setLoading(false)
          return
        }

        setError('Gagal memuat data'); setLoading(false)
      })
  }, [])

  const filtered = items.filter(d => {
    const query = search.toLowerCase()
    return !query
      || d.judul.toLowerCase().includes(query)
      || (d.fungsi_nama ?? '').toLowerCase().includes(query)
      || (d.kegiatan_nama ?? '').toLowerCase().includes(query)
      || (d.revision_notes ?? '').toLowerCase().includes(query)
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
              <FileText size={12} /><span>Dokumen</span><ChevronRight size={10} />
              <span className="text-primary">Revisi Dokumen</span>
            </div>
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Revisi Dokumen</h2>
            <p className="text-on-surface-variant text-xs mt-1">
              {filtered.length} dokumen dikembalikan untuk diperbaiki.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline/40" />
            <input
              type="text"
              placeholder="Cari judul, fungsi, kegiatan..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
              className="pl-9 pr-4 py-2 w-full bg-white border border-border rounded-lg text-xs focus:ring-1 focus:ring-ring/40 outline-none placeholder:text-outline/40"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-error/5 rounded-2xl border border-error/20">
            <AlertCircle size={32} className="text-error" />
            <p className="text-sm text-on-surface-variant">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-surface-container-low/30 rounded-2xl border border-outline-variant/20">
            <div className="w-14 h-14 rounded-xl bg-green-500/10 flex items-center justify-center">
              <FileText size={24} className="text-green-500" />
            </div>
            <p className="font-headline text-lg font-bold text-on-surface">Tidak ada dokumen</p>
            <p className="text-on-surface-variant text-xs">
              {search ? 'Tidak ada dokumen yang cocok dengan pencarian Anda.' : 'Dokumen yang dikembalikan akan muncul di sini.'}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-surface-container-low/30">
                      <TableHead className="w-12 text-center">No</TableHead>
                      <TableHead>Judul</TableHead>
                      <TableHead>Kegiatan</TableHead>
                      <TableHead className="text-center">Tahun</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Tanggal</TableHead>
                      <TableHead className="text-center w-20">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.map((dok, i) => (
                      <TableRow key={dok.id} className="group hover:bg-primary/5 transition-colors">
                        <TableCell className="text-center text-xs text-outline">
                          {page * PAGE_SIZE + i + 1}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-semibold text-sm text-on-surface line-clamp-1">{dok.judul}</p>
                            <p className="text-[10px] text-on-surface-variant mt-0.5">{dok.fungsi_nama ?? '—'}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-on-surface">{dok.kegiatan_nama ?? '—'}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs font-semibold text-on-surface">{dok.tahun}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <StatusBadge status={dok.status} />
                            <StepBadge step={dok.current_step} />
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs text-on-surface-variant">{formatDate(dok.tanggal)}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Link to="/pegawai/dokumen/$id/revisi" params={{ id: dok.id }}>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              aria-label={`Revisi dokumen ${dok.judul}`}
                            >
                              <FileEdit size={14} className="text-amber-500" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  size="icon-xs" variant="outline"
                  aria-label="Halaman sebelumnya"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft size={14} />
                </Button>
                <span className="text-xs text-on-surface-variant">
                  Halaman {page + 1} dari {totalPages}
                </span>
                <Button
                  size="icon-xs" variant="outline"
                  aria-label="Halaman berikutnya"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </PageLayout>
  )
}
