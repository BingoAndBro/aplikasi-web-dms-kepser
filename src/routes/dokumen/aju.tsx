import { createFileRoute, redirect } from '@tanstack/react-router'

// Route ini sudah dipindahkan ke /pegawai/dokumen/aju
// Redirect otomatis agar link lama tetap berfungsi
export const Route = createFileRoute('/dokumen/aju')({
  beforeLoad: () => {
    throw redirect({ to: '/pegawai/dokumen/aju', replace: true })
  },
  component: () => null,
})
