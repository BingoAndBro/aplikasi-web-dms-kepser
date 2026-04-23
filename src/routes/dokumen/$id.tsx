import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/dokumen/$id')({
  component: DokumenLayout,
})

function DokumenLayout() {
  return <Outlet />
}