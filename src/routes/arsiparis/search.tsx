import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/arsiparis/search')({
  beforeLoad: () => {
    throw redirect({ to: '/arsiparis/berkas', replace: true })
  },
  component: () => null,
})
