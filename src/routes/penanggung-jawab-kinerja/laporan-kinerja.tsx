import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'

import { MonitoringRealisasiView } from '#/components/kinerja/MonitoringRealisasiView'
import { createMonitoringRealisasiHandlers } from '#/components/kinerja/monitoringRealisasiNavigation'

export const Route = createFileRoute('/penanggung-jawab-kinerja/laporan-kinerja')({
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
  component: LaporanKinerjaPage,
})

function LaporanKinerjaPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const handlers = createMonitoringRealisasiHandlers(search, (next) =>
    navigate({ to: '/penanggung-jawab-kinerja/laporan-kinerja', search: next }),
  )

  return <MonitoringRealisasiView {...handlers} />
}
