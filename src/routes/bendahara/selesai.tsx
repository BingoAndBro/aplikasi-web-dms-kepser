import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { DashboardShell } from '#/components/dashboard/DashboardShell'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { FileText, ChevronRight, Eye, AlertCircle, CheckCircle2, Banknote } from 'lucide-react'

type Item = { id: string; judul: string; fungsi_nama: string; kegiatan_nama: string; tahun: number; updated_at: string }

function formatDate(str: string) { try { return new Date(str).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return str } }

export const Route = createFileRoute('/bendahara/selesai')({ component: BendaharaSelesaiPage })

function BendaharaSelesaiPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/bendahara/selesai', { credentials: 'include' })
      .then(r => r.json()).then(d => { setItems(d.dokumen ?? []); setLoading(false) })
      .catch(() => { setError('Gagal memuat data'); setLoading(false) })
  }, [])

  return (
    <DashboardShell role="BENDAHARA" showHero={false}>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
            <Banknote size={12} />
            <Link to="/bendahara" className="hover:text-primary">Bendahara</Link>
            <ChevronRight size={10} />
            <span className="text-primary">Dokumen Selesai</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">Dokumen Selesai</h2>
          <p className="text-on-surface-variant text-xs mt-1">{items.length} dokumen telah disetujui pencairannya.</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : error ? (
          <div className="flex flex-col items-center py-20 gap-4 bg-error/5 rounded-2xl border border-error/20">
            <AlertCircle size={32} className="text-error" /><p className="text-sm text-on-surface-variant">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-4 bg-white/5 rounded-2xl border border-white/10">
            <div className="w-14 h-14 rounded-xl bg-green-500/10 flex items-center justify-center"><CheckCircle2 size={24} className="text-green-500" /></div>
            <p className="font-headline text-lg font-bold text-on-surface">Belum ada dokumen</p>
            <p className="text-on-surface-variant text-xs">Dokumen yang telah Anda setujui akan muncul di sini.</p>
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
                    <TableHead className="text-center">Tanggal Selesai</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center w-20">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((d, i) => (
                    <TableRow key={d.id} className="group hover:bg-primary/5 transition-colors">
                      <TableCell className="text-center text-xs text-outline">{i + 1}</TableCell>
                      <TableCell><p className="font-semibold text-sm text-on-surface line-clamp-1">{d.judul}</p></TableCell>
                      <TableCell><span className="text-xs text-on-surface">{d.fungsi_nama ?? '—'}</span></TableCell>
                      <TableCell><span className="text-xs text-on-surface">{d.kegiatan_nama ?? '—'}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs font-semibold text-on-surface">{d.tahun}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs text-on-surface-variant">{formatDate(d.updated_at)}</span></TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800 text-[10px] font-semibold">Selesai</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Link to="/bendahara/dokumen/$id" params={{ id: d.id }}><Button size="icon-xs" variant="ghost"><Eye size={14} /></Button></Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}

export const Route2 = createFileRoute('/bendahara/selesai')({ component: BendaharaSelesaiPage })