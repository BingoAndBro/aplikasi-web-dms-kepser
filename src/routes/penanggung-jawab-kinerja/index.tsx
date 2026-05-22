import { createFileRoute, redirect } from '@tanstack/react-router'

import { ROUTES } from '#/lib/constants/routes'

export const Route = createFileRoute('/penanggung-jawab-kinerja/')({
  beforeLoad: () => {
    throw redirect({ to: ROUTES.PENANGGUNG_JAWAB_KINERJA.LAPORAN_KINERJA })
  },
})
