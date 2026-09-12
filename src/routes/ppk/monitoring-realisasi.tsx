import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'

import { MonitoringRealisasiView } from '#/components/kinerja/MonitoringRealisasiView'
import { createMonitoringRealisasiHandlers } from '#/components/kinerja/monitoringRealisasiNavigation'

export const Route = createFileRoute('/ppk/monitoring-realisasi')({
  validateSearch: z.object({
    fungsiId: z.string().optional(),
    kegiatanId: z.string().optional(),
    komponenId: z.string().optional(),
    groupBy: z.enum(['kegiatan', 'pegawai']).optional(),
    pegawaiId: z.string().optional(),
    periode: z.enum(['TRIWULAN', 'TAHUNAN', 'SEMUA', 'KUSTOM']).optional(),
    tahun: z.number().optional(),
    triwulan: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    dari: z.string().optional(),
    sampai: z.string().optional(),
  }),
  component: PpkMonitoringRealisasiPage,
})

const PAGE_TITLE = 'Monitoring Nominal Realisasi'

function PpkMonitoringRealisasiPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const handlers = createMonitoringRealisasiHandlers(search, (next) =>
    navigate({ to: '/ppk/monitoring-realisasi', search: next }),
  )

  return (
    <MonitoringRealisasiView
      {...handlers}
      title={PAGE_TITLE}
      description="Pantau total nominal realisasi berdasarkan kegiatan atau berdasarkan pegawai."
      forbiddenDescription="Monitoring Nominal Realisasi hanya dapat diakses oleh peran yang ditetapkan melalui otorisasi server."
      loadingLabel="Memuat Monitoring Nominal Realisasi"
    />
  )
}
