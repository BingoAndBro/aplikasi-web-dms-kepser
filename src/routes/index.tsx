import { createFileRoute } from '@tanstack/react-router'
import { DashboardShell } from '#/components/dashboard/DashboardShell'
import { StatsBento } from '#/components/dashboard/StatsBento'
import type { RoleName } from '#/lib/types/auth'

export const Route = createFileRoute('/')({
  component: PegawaiDashboard,
})

function PegawaiDashboard() {
  return (
    <DashboardShell role="PEGAWAI">
      <StatsBento role="PEGAWAI" />
    </DashboardShell>
  )
}
