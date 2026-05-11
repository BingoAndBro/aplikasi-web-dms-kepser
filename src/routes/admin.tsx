import { createFileRoute, Outlet } from '@tanstack/react-router'

import { guardRole } from '#/lib/guards'

export const Route = createFileRoute('/admin')({
  beforeLoad: async ({ event }) => {
    await guardRole(event, 'ADMIN')
  },
  component: () => <Outlet />,
})
