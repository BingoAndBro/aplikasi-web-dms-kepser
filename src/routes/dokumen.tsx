import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/dokumen')({
  loader: () => {
    throw redirect({ to: '/dokumen/saya' })
  },
  component: function Empty() {
    return null
  },
})
