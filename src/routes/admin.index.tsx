import { createFileRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import {
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminSummaryCard,
} from '#/components/admin/AdminPagePrimitives'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { apiFetch } from '#/lib/api-client'
import { ROLES } from '#/lib/constants/roles'
import {
  Building2,
  ClipboardList,
  FileCheck,
  Shield,
  UserCog,
  Users,
} from 'lucide-react'

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
  kelengkapan: number
}

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
})

function AdminDashboard() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

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
    async function fetchStats() {
      setLoadingStats(true)
      setStatsError(null)
      try {
        const [usersResponse, kelengkapan] = await Promise.all([
          apiFetch<UsersListResponse>('/users/'),
          apiFetch<MasterRow[]>('/master-kelengkapan'),
        ])
        const users = usersResponse.users ?? []
        const roleSet = new Set<string>()
        for (const user of users) {
          for (const role of user.roles ?? []) roleSet.add(role)
        }
        setStats({
          totalUsers: users.length,
          activeUsers: users.filter(user => user.isActive).length,
          usedRoles: roleSet.size,
          kelengkapan: Array.isArray(kelengkapan) ? kelengkapan.length : 0,
        })
      } catch {
        setStatsError('Ringkasan admin belum dapat dimuat. Menu konfigurasi tetap tersedia.')
      } finally {
        setLoadingStats(false)
      }
    }

    fetchStats()
  }, [])

  return (
    <PageLayout>
      <div className="space-y-6">
        <AdminPageHeader
          eyebrow={(
            <>
              <Shield size={12} />
              <span>Admin Sistem</span>
            </>
          )}
          title="Ruang Konfigurasi Sistem"
          description="Kelola user, master data, dan konfigurasi kelengkapan dokumen. Area ini tidak menjalankan aksi approval, validasi, arsip, klasifikasi, atau pemusnahan dokumen."
          actions={(
            <Button render={<a href="/admin/master-data/user" />} size="sm" className="gap-1.5">
              <UserCog size={14} />
              Master User
            </Button>
          )}
        />

        {statsError && (
          <ErrorState
            variant="warning"
            title="Ringkasan terbatas"
            description={statsError}
          />
        )}

        {loadingStats ? (
          <LoadingState variant="page" label="Memuat ringkasan Admin Sistem" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AdminSummaryCard
              label="Total User"
              value={stats?.totalUsers ?? '—'}
              helper="Akun yang tercatat di sistem lokal."
              icon={<Users size={20} />}
              emphasis
            />
            <AdminSummaryCard
              label="User Aktif"
              value={stats?.activeUsers ?? '—'}
              helper="Akun yang masih dapat login."
              icon={<UserCog size={20} />}
            />
            <AdminSummaryCard
              label="Role Terpakai"
              value={stats?.usedRoles ?? '—'}
              helper="Role yang sedang dipakai oleh user."
              icon={<Shield size={20} />}
            />
            <AdminSummaryCard
              label="Konfigurasi Kelengkapan"
              value={stats?.kelengkapan ?? '—'}
              helper="Item kelengkapan dokumen aktif dalam workspace konfigurasi."
              icon={<FileCheck size={20} />}
            />
          </div>
        )}

        <AdminPanel className="space-y-4">
          <div>
            <h2 className="font-headline text-lg font-extrabold text-zinc-950">Aksi Cepat Konfigurasi</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Gunakan pintasan ini untuk pekerjaan sistem dan master data. Tidak ada aksi workflow operasional di dashboard Admin Sistem.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <AdminQuickLink
              href="/admin/master-data/user"
              icon={<Users size={18} />}
              title="Master User"
              description="Kelola akun, role, status aktif, Ketua Tim, dan reset password admin."
            />
            <AdminQuickLink
              href="/admin/master-data/fungsi"
              icon={<Building2 size={18} />}
              title="Master Data"
              description="Kelola Fungsi, Kegiatan, Jenis Permintaan, Kategori, Detail, dan Jenis Dokumen."
            />
            <AdminQuickLink
              href="/admin/master-data/kelengkapan"
              icon={<ClipboardList size={18} />}
              title="Kelengkapan Dokumen"
              description="Bangun konteks Fungsi sampai leaf lalu atur kelengkapan Ketua Tim dan Anggota."
            />
          </div>
        </AdminPanel>

        <AdminNotice>
          Admin Sistem adalah role konfigurasi. Server/API tetap menjadi otoritas RBAC; tampilan ini tidak menjadikan ADMIN sebagai role operasional workflow.
        </AdminNotice>
      </div>
    </PageLayout>
  )
}

function AdminQuickLink({
  href,
  icon,
  title,
  description,
}: {
  href: string
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <a
      href={href}
      className="group rounded-2xl border border-orange-100 bg-[#FFFDF9] p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:bg-orange-50/50"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-800 transition group-hover:bg-orange-600 group-hover:text-white">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-bold text-zinc-950">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600">{description}</p>
        </div>
      </div>
    </a>
  )
}
