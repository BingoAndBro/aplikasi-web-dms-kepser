import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'

import { MonitoringRealisasiView } from '#/components/kinerja/MonitoringRealisasiView'

export const Route = createFileRoute('/penanggung-jawab-kinerja/laporan-kinerja')({
  validateSearch: z.object({
    fungsiId: z.string().optional(),
    kegiatanId: z.string().optional(),
  }),
  component: LaporanKinerjaPage,
})

function LaporanKinerjaPage() {
  const navigate = useNavigate()
  const { fungsiId, kegiatanId } = Route.useSearch()

  return (
    <MonitoringRealisasiView
      fungsiId={fungsiId}
      kegiatanId={kegiatanId}
      onSelectFungsi={(id) =>
        navigate({
          to: '/penanggung-jawab-kinerja/laporan-kinerja',
          search: id ? { fungsiId: id } : {},
        })
      }
      onSelectKegiatan={(selectedFungsiId, selectedKegiatanId) =>
        navigate({
          to: '/penanggung-jawab-kinerja/laporan-kinerja',
          search: selectedKegiatanId
            ? { fungsiId: selectedFungsiId, kegiatanId: selectedKegiatanId }
            : { fungsiId: selectedFungsiId },
        })
      }
    />
  )
}
