import { createFileRoute, Outlet } from '@tanstack/react-router'

import { ROLES } from '#/lib/constants/roles'
import { guardRole } from '#/lib/guards'

export const Route = createFileRoute('/kasubag')({
  beforeLoad: ({ event }) => {
    guardRole(ROLES.KEPALA_SUB_BAGIAN_UMUM)(event)
  },
  component: () => <Outlet />,
})
