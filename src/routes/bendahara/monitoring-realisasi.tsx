import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'

import { MonitoringRealisasiView } from '#/components/kinerja/MonitoringRealisasiView'
import { createMonitoringRealisasiHandlers } from '#/components/kinerja/monitoringRealisasiNavigation'

export const Route = createFileRoute('/bendahara/monitoring-realisasi')({
  validateSearch: z.object({
    fungsiId: z.string().optional(),
    kegiatanId: z.string().optional(),
    groupBy: z.enum(['kegiatan', 'pegawai']).optional(),
    pegawaiId: z.string().optional(),
  }),
  component: BendaharaMonitoringRealisasiPage,
})

const PAGE_TITLE = 'Monitoring Nominal Realisasi'

function BendaharaMonitoringRealisasiPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const handlers = createMonitoringRealisasiHandlers(search, (next) =>
    navigate({ to: '/bendahara/monitoring-realisasi', search: next }),
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
