import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  Search,
  FileText,
  ChevronRight,
  ChevronLeft,
  Eye,
  AlertCircle,
  ClipboardList,
} from 'lucide-react'
import { getBrowserClient } from '#/lib/supabase-browser'
import { cn } from '#/lib/utils'
import { formatDate } from '#/lib/utils/format'

type InboxItem = {
  id: string
  judul: string
  fungsi_id: string
  fungsi_nama: string
  kegiatan_jenis_id: string
  kegiatan_nama: string
  created_by: string
  tahun: number
  tanggal: string
  created_at: string
}

export const Route = createFileRoute('/ppk/inbox')({
  component: PpkInboxPage,
})

const PAGE_SIZE = 10


function PpkInboxPage() {
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [fungsiList, setFungsiList] = useState<{ id: string; nama: string }[]>([])
  const [fungsiFilter, setFungsiFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(0)

  // Fetch fungsi list for filter dropdown
  useEffect(() => {
    const supabase = getBrowserClient()
    if (!supabase) return
    supabase
      .from('master_fungsi')
      .select('id, nama')
      .eq('is_active', true)
      .order('nama', { ascending: true })
      .then(({ data }: { data: { id: string; nama: string }[] | null }) => { setFungsiList(data ?? []) })
  }, [])

  // Fetch inbox data
  async function fetchData() {
    setLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams()
      if (fungsiFilter) params.set('fungsi_id', fungsiFilter)
      if (startDate) params.set('start_date', startDate)
      if (endDate) params.set('end_date', endDate)

      const res = await fetch(`/api/ppk/inbox?${params}`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const json = await res.json()
        setFetchError(json.error ?? `HTTP ${res.status}`)
        setLoading(false)
        return
      }
      const json = await res.json()
      setItems(json.dokumen ?? [])
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [fungsiFilter, startDate, endDate])

  // Client-side search filter
  const filtered = items.filter(d =>
    !search ||
    d.judul.toLowerCase().includes(search.toLowerCase()) ||
    d.fungsi_nama.toLowerCase().includes(search.toLowerCase()) ||
    d.kegiatan_nama.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <PageLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
            <ClipboardList size={12} />
            <Link to="/ppk" className="hover:text-primary">PPK</Link>
            <ChevronRight size={10} />
            <span className="text-primary">Validasi Dokumen</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">
            Dokumen Menunggu Validasi
          </h2>
          <p className="text-on-surface-variant text-xs mt-1">
            {items.length} dokumen menunggu validasi Anda.
          </p>
        </div>

        {/* Filters */}
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
          <select
            value={fungsiFilter}
            onChange={e => { setFungsiFilter(e.target.value); setPage(0) }}
            className="px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground outline-none focus:ring-1 focus:ring-ring/40 cursor-pointer"
          >
            <option value="">Semua Fungsi</option>
            {fungsiList.map(f => (
              <option key={f.id} value={f.id}>{f.nama}</option>
            ))}
          </select>
          <input
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setPage(0) }}
            className="px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground outline-none focus:ring-1 focus:ring-ring/40 cursor-pointer"
            title="Tanggal mulai"
          />
          <input
            type="date"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); setPage(0) }}
            className="px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground outline-none focus:ring-1 focus:ring-ring/40 cursor-pointer"
            title="Tanggal akhir"
          />
          {(fungsiFilter || startDate || endDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFungsiFilter('')
                setStartDate('')
                setEndDate('')
                setPage(0)
              }}
              className="text-xs"
            >
              Reset
            </Button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-error/5 rounded-2xl border border-error/20">
            <AlertCircle size={32} className="text-error" />
            <div className="text-center">
              <p className="font-headline text-base font-bold text-error">Gagal memuat data</p>
              <p className="text-on-surface-variant text-xs mt-1">{fetchError}</p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchData}>
              Coba Lagi
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-surface-container-low/30 rounded-2xl border border-outline-variant/20">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText size={24} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="font-headline text-lg font-bold text-on-surface">Tidak ada dokumen</p>
              <p className="text-on-surface-variant text-xs mt-1">
                {search || fungsiFilter || startDate || endDate
                  ? 'Tidak ada dokumen yang cocok dengan filter Anda.'
                  : 'Belum ada dokumen yang menunggu validasi.'}
              </p>
            </div>
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
                      <TableHead>Fungsi</TableHead>
                      <TableHead>Kegiatan</TableHead>
                      <TableHead className="text-center">Tahun</TableHead>
                      <TableHead className="text-center">Tanggal Ajuan</TableHead>
                      <TableHead className="text-center">Status</TableHead>
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
                            <p className="text-[10px] text-on-surface-variant mt-0.5">
                              Diajukan: {formatDate(dok.created_at)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-on-surface">{dok.fungsi_nama ?? '—'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-on-surface">{dok.kegiatan_nama ?? '—'}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs font-semibold text-on-surface">{dok.tahun}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs text-on-surface-variant">{formatDate(dok.tanggal)}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-semibold">
                            Validasi PPK
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Link to="/ppk/dokumen/$id" params={{ id: dok.id }}>
                            <Button size="icon-xs" variant="ghost" aria-label="Lihat detail">
                              <Eye size={14} />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  size="icon-xs" variant="outline"
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