import { createFileRoute, Outlet } from '@tanstack/react-router'

// Layout wrapper for /pegawai/dokumen/* routes.
// The actual index page is in dokumen/index.tsx.
export const Route = createFileRoute('/pegawai/dokumen')({
  component: () => <Outlet />,
})
