import { createFileRoute, redirect } from '@tanstack/react-router'

// Redirect /dokumen/aji → /dokumen/aju (typo variant)
export const Route = createFileRoute('/dokumen/aji')({
  loader: () => {
    throw redirect({ to: '/dokumen/aju' })
  },
  component: function Empty() {
    return null
  },
})
