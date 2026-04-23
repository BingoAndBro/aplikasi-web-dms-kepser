import { createFileRoute } from '@tanstack/react-router'
import { DashboardShell } from '#/components/dashboard/DashboardShell'
import { StatsBento } from '#/components/dashboard/StatsBento'

export const Route = createFileRoute('/bendahara/')({
  component: BendaharaDashboardPage,
})

function BendaharaDashboardPage() {
  return (
    <DashboardShell role="BENDAHARA">
      <StatsBento role="BENDAHARA" />
    </DashboardShell>
  )
}
