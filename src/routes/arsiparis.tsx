import { createFileRoute, Outlet } from '@tanstack/react-router'

import { guardRole } from '#/lib/guards'

export const Route = createFileRoute('/arsiparis')({
  beforeLoad: ({ event }) => {
    guardRole('ARSIPARIS')(event)
  },
  component: () => <Outlet />,
})
