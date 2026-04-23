import { createFileRoute, redirect } from '@tanstack/react-router'

// Route ini sudah dipindahkan ke /pegawai/dokumen/$id/revisi
// Redirect otomatis agar link lama tetap berfungsi
export const Route = createFileRoute('/dokumen/$id/edit')({
  beforeLoad: ({ params }: { params: { id: string } }) => {
    throw redirect({ to: '/pegawai/dokumen/$id/revisi', params: { id: params.id }, replace: true })
  },
  component: () => null,
})