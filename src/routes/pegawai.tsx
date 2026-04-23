import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/pegawai')({
  ssr: false,
  component: function PegawaiLayout() {
    return <Outlet />
  },
})
