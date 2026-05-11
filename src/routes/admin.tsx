import { createFileRoute, Outlet } from '@tanstack/react-router'

import { guardRole } from '#/lib/guards'

export const Route = createFileRoute('/admin')({
  beforeLoad: ({ event }) => {
    guardRole('ADMIN')(event)
  },
  component: () => <Outlet />,
})
