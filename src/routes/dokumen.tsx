import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/dokumen')({
  ssr: false,
  component: function DokumenLayout() {
    return <Outlet />
  },
})
