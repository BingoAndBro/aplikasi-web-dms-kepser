import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'

import { MonitoringRealisasiView } from '#/components/kinerja/MonitoringRealisasiView'

export const Route = createFileRoute('/ppk/monitoring-realisasi')({
  validateSearch: z.object({
    fungsiId: z.string().optional(),
    kegiatanId: z.string().optional(),
  }),
  component: PpkMonitoringRealisasiPage,
})

const PAGE_TITLE = 'Monitoring Nominal Realisasi'

function PpkMonitoringRealisasiPage() {
  const navigate = useNavigate()
  const { fungsiId, kegiatanId } = Route.useSearch()

  return (
    <MonitoringRealisasiView
      fungsiId={fungsiId}
      kegiatanId={kegiatanId}
      title={PAGE_TITLE}
      description="Pantau total nominal realisasi per kegiatan berdasarkan fungsi dan kegiatan."
      forbiddenDescription="Monitoring Nominal Realisasi hanya dapat diakses oleh peran yang ditetapkan melalui otorisasi server."
      loadingLabel="Memuat Monitoring Nominal Realisasi"
      onSelectFungsi={(id) =>
        navigate({
          to: '/ppk/monitoring-realisasi',
          search: id ? { fungsiId: id } : {},
        })
      }
      onSelectKegiatan={(selectedFungsiId, selectedKegiatanId) =>
        navigate({
          to: '/ppk/monitoring-realisasi',
          search: selectedKegiatanId
            ? { fungsiId: selectedFungsiId, kegiatanId: selectedKegiatanId }
            : { fungsiId: selectedFungsiId },
        })
      }
    />
  )
}
