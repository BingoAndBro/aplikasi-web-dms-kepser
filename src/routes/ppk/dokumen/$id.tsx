import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/ppk/dokumen/$id')({
  component: () => <Outlet />,
})
