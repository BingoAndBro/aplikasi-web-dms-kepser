import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Search, FileArchive, Archive } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Input } from '#/components/ui/input'
import { StatusBadge } from '#/components/ui/StatusBadge'

export const Route = createFileRoute('/arsiparis/')({
  component: ArsiparisScreen,
})

const MOCK_ARCHIVE = [
  { id: '1', judul: 'Laporan Triwulan I', klasifikasi: 'Keuangan', retensi: '5 Tahun', status: 'COMPLETED', date: '2026-03-30' },
  { id: '2', judul: 'Data Agregat Pertanian', klasifikasi: 'Statistik', retensi: '10 Tahun', status: 'COMPLETED', date: '2026-03-29' },
]

function ArsiparisScreen() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-primary">Ruang Arsiparis</h2>
          <p className="text-muted-foreground">Tinjau dokumen yang telah disetujui penuh untuk pengarsipan final.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Dokumen Menunggu Arsip</CardTitle>
              <CardDescription>Dokumen berstatus COMPLETED yang menanti penetapan klasifikasi dan retensi.</CardDescription>
            </div>
            <div className="relative w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input type="search" placeholder="Cari dokumen..." className="pl-8" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Judul Dokumen</TableHead>
                  <TableHead>Klasifikasi Prediksi</TableHead>
                  <TableHead>Retensi Dasar</TableHead>
                  <TableHead>Tgl Tuntas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_ARCHIVE.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileArchive className="h-4 w-4 text-primary" />
                        {doc.judul}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{doc.klasifikasi}</TableCell>
                    <TableCell className="text-muted-foreground">{doc.retensi}</TableCell>
                    <TableCell className="text-muted-foreground">{doc.date}</TableCell>
                    <TableCell>
                      <StatusBadge status={doc.status as any} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="default" size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                        <Archive className="mr-2 h-4 w-4"/>
                        Arsipkan
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
