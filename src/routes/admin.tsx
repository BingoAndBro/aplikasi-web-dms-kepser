import { createFileRoute, Outlet } from '@tanstack/react-router'

import { guardRole } from '#/lib/guards'

export const Route = createFileRoute('/admin')({
  beforeLoad: () => {
    guardRole('ADMIN')()
  },
  component: () => <Outlet />,
})
