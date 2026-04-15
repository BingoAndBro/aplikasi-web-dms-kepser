import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/master-data/')({
  loader: () => {
    throw redirect({ to: '/admin/master-data/fungsi' })
  },
  component: function Empty() {
    return null
  },
})
