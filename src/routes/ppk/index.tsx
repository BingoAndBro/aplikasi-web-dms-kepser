import { createFileRoute } from '@tanstack/react-router'
import { DashboardShell } from '#/components/dashboard/DashboardShell'
import { StatsBento } from '#/components/dashboard/StatsBento'

export const Route = createFileRoute('/ppk/')({
  component: PpkDashboardPage,
})

function PpkDashboardPage() {
  return (
    <DashboardShell role="PPK">
      <StatsBento role="PPK" />
    </DashboardShell>
  )
}
