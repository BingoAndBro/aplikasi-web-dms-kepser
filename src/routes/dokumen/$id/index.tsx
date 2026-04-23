import { createFileRoute, redirect } from '@tanstack/react-router'

// Route ini sudah dipindahkan ke /pegawai/dokumen/$id
// Redirect otomatis agar link lama tetap berfungsi
export const Route = createFileRoute('/dokumen/$id/')({
  beforeLoad: ({ params }: { params: { id: string } }) => {
    throw redirect({ to: '/pegawai/dokumen/$id', params: { id: params.id }, replace: true })
  },
  component: () => null,
})
