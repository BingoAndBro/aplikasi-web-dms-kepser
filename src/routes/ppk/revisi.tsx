import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { FileText, ChevronRight, Eye, AlertCircle, FileEdit, ArrowLeft } from 'lucide-react'
import { cn } from '#/lib/utils'
import { formatDate } from '#/lib/utils/format'

type Item = {
  id: string; judul: string; fungsi_nama: string; kegiatan_nama: string
  tahun: number; tanggal: string; created_at: string; updated_at: string; revision_notes: string | null
}

export const Route = createFileRoute('/ppk/revisi')({ component: PpkRevisiPage })


function truncate(str: string | null, len = 50): string {
  if (!str) return '—'
  return str.length > len ? str.slice(0, len) + '...' : str
}

function PpkRevisiPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/ppk/revisi', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setItems(d.dokumen ?? []); setLoading(false) })
      .catch(() => { setError('Gagal memuat data'); setLoading(false) })
  }, [])

  return (
    <PageLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
            <FileEdit size={12} />
            <Link to="/ppk" className="hover:text-primary">PPK</Link>
            <ChevronRight size={10} />
            <span className="text-primary">Revisi Dokumen</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">Revisi Dokumen</h2>
          <p className="text-on-surface-variant text-xs mt-1">
            {items.length} dokumen dikembalikan oleh Bendahara untuk diperbaiki.
          </p>
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
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-surface-container-low/30 rounded-2xl border border-outline-variant/20">
            <div className="w-14 h-14 rounded-xl bg-green-500/10 flex items-center justify-center">
              <FileText size={24} className="text-green-500" />
            </div>
            <p className="font-headline text-lg font-bold text-on-surface">Tidak ada dokumen</p>
            <p className="text-on-surface-variant text-xs">Dokumen yang dikembalikan Bendahara akan muncul di sini.</p>
          </div>
        ) : (
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
                    <TableHead className="text-center">Tanggal Penolakan</TableHead>
                    <TableHead>Catatan Bendahara</TableHead>
                    <TableHead className="text-center w-24">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((d, i) => (
                    <TableRow key={d.id} className="group hover:bg-primary/5 transition-colors">
                      <TableCell className="text-center text-xs text-outline">{i + 1}</TableCell>
                      <TableCell>
                        <p className="font-semibold text-sm text-on-surface line-clamp-1">{d.judul}</p>
                      </TableCell>
                      <TableCell><span className="text-xs text-on-surface">{d.fungsi_nama ?? '—'}</span></TableCell>
                      <TableCell><span className="text-xs text-on-surface">{d.kegiatan_nama ?? '—'}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs font-semibold text-on-surface">{d.tahun}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs text-on-surface-variant">{formatDate(d.updated_at)}</span></TableCell>
                      <TableCell>
                        <p className="text-xs text-on-surface-variant max-w-[200px] line-clamp-2" title={d.revision_notes ?? undefined}>
                          {truncate(d.revision_notes, 60)}
                        </p>
                      </TableCell>
                      <TableCell className="text-center">
                        <Link to="/ppk/dokumen/$id/resubmit" params={{ id: d.id }}>
                          <Button size="sm" className="gap-1.5" variant="secondary">
                            <FileEdit size={14} />Buka Revisi
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  )
}