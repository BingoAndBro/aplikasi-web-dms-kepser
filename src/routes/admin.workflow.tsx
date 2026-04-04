import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Plus, ArrowDown, Save } from 'lucide-react'

export const Route = createFileRoute('/admin/workflow')({
  component: WorkflowBuilderScreen,
})

function WorkflowBuilderScreen() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-primary">Konfigurasi Alur Kerja</h2>
        <p className="text-muted-foreground">Rancang tahapan persetujuan dinamis sesuai kebijakan BPS.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Info Dasar</CardTitle>
              <CardDescription>Nama dan tujuan alur kerja.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nama Template</label>
                <Input placeholder="Contoh: Laporan Sensus" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Kategori</label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Pilih Kategori" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ad-hoc">Ad-Hoc</SelectItem>
                    <SelectItem value="rutin">Rutin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Tahapan Persetujuan (Steps)</CardTitle>
                <CardDescription>Atur urutan peninjau dokumen secara sekuensial.</CardDescription>
              </div>
              <Button size="sm" variant="outline"><Plus className="mr-2 h-4 w-4"/> Tambah Tahap</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              
              {/* Step 1 */}
              <div className="flex items-center gap-4 bg-background p-4 rounded-lg border border-l-4 border-l-primary/50 shadow-sm relative">
                <div className="h-8 w-8 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">1</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Aksi</label>
                    <Select defaultValue="UPLOAD">
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UPLOAD">Upload</SelectItem>
                        <SelectItem value="REVIEW">Review</SelectItem>
                        <SelectItem value="APPROVE">Approve</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Role Bertanggung Jawab</label>
                    <Select defaultValue="STAF">
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STAF">Staf Lapangan</SelectItem>
                        <SelectItem value="KASEK">Kepala Seksi</SelectItem>
                        <SelectItem value="KABAG">Kepala Bagian</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

               <div className="flex justify-center"><ArrowDown className="h-5 w-5 text-muted-foreground/50" /></div>

              {/* Step 2 */}
              <div className="flex items-center gap-4 bg-background p-4 rounded-lg border border-l-4 border-l-blue-500 shadow-sm relative">
                <div className="h-8 w-8 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">2</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Aksi</label>
                    <Select defaultValue="APPROVE">
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UPLOAD">Upload</SelectItem>
                        <SelectItem value="REVIEW">Review</SelectItem>
                        <SelectItem value="APPROVE">Approve</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Role Bertanggung Jawab</label>
                    <Select defaultValue="KASEK">
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STAF">Staf Lapangan</SelectItem>
                        <SelectItem value="KASEK">Kepala Seksi</SelectItem>
                        <SelectItem value="KABAG">Kepala Bagian</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

            </CardContent>
            <CardFooter className="bg-muted/30 border-t p-4 flex justify-end gap-2">
              <Button variant="ghost">Batal</Button>
              <Button><Save className="mr-2 h-4 w-4"/> Simpan Workflow</Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
