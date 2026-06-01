import { createFileRoute } from '@tanstack/react-router'
import {
  WorkflowDashboardCard,
  WorkflowPageHeader,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import { Banknote, CheckCircle2, FileX } from 'lucide-react'

export const Route = createFileRoute('/bendahara/')({
  component: BendaharaDashboardPage,
})

function BendaharaDashboardPage() {
  return (
    <div className="space-y-6">
      <WorkflowPageHeader
        tone="ppspm"
        eyebrow={
          <>
            <Banknote size={12} />
            <span>PPSPM</span>
          </>
        }
        title="Ruang Persetujuan PPSPM"
        description="Ruang kerja Pejabat Penandatangan Surat Perintah Membayar untuk menyetujui dokumen yang sudah divalidasi PPK atau mengembalikannya ke PPK."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <WorkflowDashboardCard
          title="Persetujuan Dokumen"
          description="Periksa dokumen yang sedang menunggu persetujuan PPSPM."
          href="/bendahara/inbox"
          icon={<Banknote size={22} />}
        />
        <WorkflowDashboardCard
          title="Dokumen Selesai"
          description="Lihat dokumen yang sudah disetujui dan berstatus selesai."
          href="/bendahara/selesai"
          icon={<CheckCircle2 size={22} />}
        />
        <WorkflowDashboardCard
          title="Dokumen Ditolak"
          description="Telusuri dokumen yang dikembalikan ke PPK untuk perbaikan."
          href="/bendahara/ditolak"
          icon={<FileX size={22} />}
        />
      </div>
    </div>
  )
}
