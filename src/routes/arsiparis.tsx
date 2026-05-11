import { createFileRoute, Outlet } from '@tanstack/react-router'

import { guardRole } from '#/lib/guards'

export const Route = createFileRoute('/arsiparis')({
  beforeLoad: async ({ event }) => {
    await guardRole(event, 'ARSIPARIS')
  },
  component: () => <Outlet />,
})
