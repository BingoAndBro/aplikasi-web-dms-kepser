import { createFileRoute } from '@tanstack/react-router'
import {
  WorkflowDashboardCard,
  WorkflowPageHeader,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import { ClipboardCheck, FileCheck2, FileText, FileX } from 'lucide-react'

export const Route = createFileRoute('/ppk/')({
  component: PpkDashboardPage,
})

function PpkDashboardPage() {
  return (
    <div className="space-y-6">
      <WorkflowPageHeader
        eyebrow={
          <>
            <ClipboardCheck size={12} />
            <span>PPK</span>
          </>
        }
        title="Ruang Validasi PPK"
        description="Fokus pada dokumen Material yang sudah masuk tahap validasi PPK. Validasi meneruskan dokumen ke PPSPM; penolakan mengembalikan dokumen ke Pegawai."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <WorkflowDashboardCard
          title="Validasi Dokumen"
          description="Periksa dokumen yang sedang menunggu keputusan PPK."
          href="/ppk/inbox"
          icon={<ClipboardCheck size={22} />}
        />
        <WorkflowDashboardCard
          title="Dokumen Tervalidasi"
          description="Lihat dokumen yang sudah diteruskan ke PPSPM atau selesai."
          href="/ppk/tervalidasi"
          icon={<FileCheck2 size={22} />}
        />
        <WorkflowDashboardCard
          title="Dokumen Tidak Valid"
          description="Telusuri dokumen yang pernah dikembalikan ke Pegawai."
          href="/ppk/ditolak"
          icon={<FileX size={22} />}
        />
        <WorkflowDashboardCard
          title="Revisi dari PPSPM"
          description="Tindak lanjuti dokumen yang perlu diajukan kembali ke PPSPM."
          href="/ppk/revisi"
          icon={<FileText size={22} />}
        />
      </div>
    </div>
  )
}
