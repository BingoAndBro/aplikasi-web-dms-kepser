import { createFileRoute, redirect } from '@tanstack/react-router'

// Route ini sudah dipindahkan ke /pegawai/dokumen
// Redirect otomatis agar link lama tetap berfungsi
export const Route = createFileRoute('/dokumen/saya')({
  beforeLoad: () => {
    throw redirect({ to: '/pegawai/dokumen', replace: true })
  },
  component: () => null,
})
