import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/pegawai/dokumen/$id')({
  component: PegawaiDokumenLayout,
})

function PegawaiDokumenLayout() {
  return (
    <>
      <Outlet />
    </>
  )
}
