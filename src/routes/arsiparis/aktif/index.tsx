import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/arsiparis/aktif/')({
  beforeLoad: () => {
    throw redirect({ to: '/arsiparis/berkas', replace: true })
  },
  component: () => null,
})
