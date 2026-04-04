import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Plus, Search, FileText } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Input } from '#/components/ui/input'
import { StatusBadge } from '#/components/ui/StatusBadge'

export const Route = createFileRoute('/')({
  component: InboxScreen,
})

const MOCK_DOCS = [
  { id: '1', judul: 'Laporan Sensus Penduduk 2026', jenis: 'Laporan Bulanan', tanggal: '2026-04-01', status: 'IN_REVIEW', assignee: 'Kepala Seksi' },
  { id: '2', judul: 'Permintaan Anggaran Triwulan II', jenis: 'Pengajuan Anggaran', tanggal: '2026-04-02', status: 'DRAFT', assignee: 'Staf Administrasi' },
  { id: '3', judul: 'Revisi Data Profil Desa', jenis: 'Update Basis Data', tanggal: '2026-04-01', status: 'NEED_REVISION', assignee: 'Staf Lapangan' },
]

function InboxScreen() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-primary">Inbox Tugas</h2>
          <p className="text-muted-foreground">Kelola dokumen yang memerlukan tindak lanjut Anda hari ini.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Upload Dokumen Baru
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Dokumen Aktif</CardTitle>
              <CardDescription>Menampilkan semua dokumen di wilayah kerja BPS Kabupaten Kepulauan Seribu</CardDescription>
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
                  <TableHead>Jenis Workflow</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Assignee Aktif</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_DOCS.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        {doc.judul}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{doc.jenis}</TableCell>
                    <TableCell className="text-muted-foreground">{doc.tanggal}</TableCell>
                    <TableCell className="font-medium">{doc.assignee}</TableCell>
                    <TableCell>
                      <StatusBadge status={doc.status as any} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm">Tinjau</Button>
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
