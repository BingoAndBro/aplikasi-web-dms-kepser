import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import {
  DashboardActionRow,
  DashboardMetricCard,
  DashboardQuickActions,
  DashboardSection,
  RoleDashboardHeader,
  RoleDashboardPage,
} from '#/components/dashboard/RoleDashboardPrimitives'
import { apiFetch } from '#/lib/api-client'
import { ROLES } from '#/lib/constants/roles'
import { ROUTES } from '#/lib/constants/routes'
import { Building2, CheckCircle2, ClipboardList, FileCheck, Settings, Shield, UserCog, Users } from 'lucide-react'

type AuthSessionResponse = {
  session: { userId: string; email: string; userName?: string | null } | null
  roles: string[]
  activeRole: string | null
}

type UsersListResponse = {
  users?: Array<{ isActive?: boolean; roles?: string[] }>
}

type MasterRow = {
  id: string
}

type AdminDashboardStats = {
  totalUsers: number
  activeUsers: number
  usedRoles: number
  fungsi: number
  kegiatan: number
  kelengkapan: number
}

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
})

function AdminDashboard() {
  const [stats, setStats] = useState<AdminDashboardStats>({
    totalUsers: 0,
    activeUsers: 0,
    usedRoles: 0,
    fungsi: 0,
    kegiatan: 0,
    kelengkapan: 0,
  })

  useEffect(() => {
    async function checkAuth() {
      try {
        const auth = await apiFetch<AuthSessionResponse>('/auth/session')
        if (!auth.session) { window.location.href = '/login'; return }
        if (!auth.roles.includes(ROLES.ADMIN)) { window.location.href = '/forbidden'; return }
      } catch {
        window.location.href = '/login'
      }
    }
    checkAuth()
  }, [])

  useEffect(() => {
    Promise.all([
      apiFetch<UsersListResponse>('/users/').catch(() => ({ users: [] })),
      apiFetch<MasterRow[]>('/master-fungsi').catch(() => []),
      apiFetch<MasterRow[]>('/master-kegiatan').catch(() => []),
      apiFetch<MasterRow[]>('/master-kelengkapan').catch(() => []),
    ]).then(([usersResponse, fungsi, kegiatan, kelengkapan]) => {
      const users = usersResponse.users ?? []
      const roleSet = new Set<string>()
      for (const user of users) {
        for (const role of user.roles ?? []) roleSet.add(role)
      }
      setStats({
        totalUsers: users.length,
        activeUsers: users.filter((user) => user.isActive).length,
        usedRoles: roleSet.size,
        fungsi: Array.isArray(fungsi) ? fungsi.length : 0,
        kegiatan: Array.isArray(kegiatan) ? kegiatan.length : 0,
        kelengkapan: Array.isArray(kelengkapan) ? kelengkapan.length : 0,
      })
    })
  }, [])

  return (
    <RoleDashboardPage>
      <RoleDashboardHeader
        title="Dashboard Admin Sistem"
        description="Kelola pengguna, hak akses, dan data referensi sistem."
        actionHref={ROUTES.ADMIN.MASTER_USER}
        actionLabel="Kelola User"
        actionIcon={<UserCog size={16} />}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard
          label="Total User"
          value={stats.totalUsers}
          badge="Terdaftar"
          icon={<Users size={20} />}
          tone="info"
        />
        <DashboardMetricCard
          label="User Aktif"
          value={stats.activeUsers}
          badge="Aktif"
          icon={<CheckCircle2 size={20} />}
          tone="success"
        />
        <DashboardMetricCard
          label="Role Terpakai"
          value={stats.usedRoles}
          badge="Akses"
          icon={<Shield size={20} />}
          tone="warning"
        />
        <DashboardMetricCard
          label="Total Kegiatan"
          value={stats.kegiatan}
          badge="Konfigurasi"
          icon={<Settings size={20} />}
          tone="info"
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <DashboardSection
          title="Aktivitas Admin Terbaru"
          description="Ringkasan lokal dashboard dari area konfigurasi. Activity Log global tetap belum diimplementasikan."
        >
          <div>
            <DashboardActionRow
              icon={<Users size={18} />}
              title="Ringkasan user dan role dimuat"
              description={`${stats.totalUsers} user, ${stats.activeUsers} aktif, ${stats.usedRoles} role terpakai.`}
              href={ROUTES.ADMIN.MASTER_USER}
              actionLabel="Master User"
            />
            <DashboardActionRow
              icon={<FileCheck size={18} />}
              title="Konfigurasi kelengkapan tersedia"
              description={`${stats.kelengkapan} item kelengkapan dokumen terbaca dari data referensi saat ini.`}
              href={ROUTES.ADMIN.MASTER_KELENGKAPAN}
              actionLabel="Kelengkapan"
            />
          </div>
        </DashboardSection>

        <DashboardQuickActions
          actions={[
            { href: ROUTES.ADMIN.MASTER_USER, label: 'Master User', icon: <Users size={16} /> },
            { href: ROUTES.ADMIN.MASTER_FUNGSI, label: 'Departemen Fungsi', icon: <Building2 size={16} /> },
            { href: ROUTES.ADMIN.MASTER_KEGIATAN, label: 'Master Kegiatan', icon: <ClipboardList size={16} /> },
            { href: ROUTES.ADMIN.MASTER_KELENGKAPAN, label: 'Kelengkapan Dokumen', icon: <FileCheck size={16} /> },
          ]}
        />
      </div>
    </RoleDashboardPage>
  )
}
