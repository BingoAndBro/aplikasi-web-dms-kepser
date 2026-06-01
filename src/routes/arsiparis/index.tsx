import { createFileRoute } from '@tanstack/react-router'
import { Archive, Clock, FolderOpen, Loader2, Plus, Tags, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  ArchivePageHeader,
  ArchiveSummaryCard,
} from '#/components/archive/ArchivePagePrimitives'
import { DashboardShell } from '#/components/dashboard/DashboardShell'
import { apiFetch } from '#/lib/api-client'
import { ROLES } from '#/lib/constants/roles'

export const Route = createFileRoute('/arsiparis/')({
  component: KepalaSubBagianUmumDashboard,
})

type Stats = {
  inbox: number
  aktif: number
  inaktif: number
  usulMusnah: number
}

type InboxStatsResponse = {
  inbox?: unknown[]
}

type BerkasStatsResponse = {
  summary?: {
    total_rows_returned?: number
  }
}

type AuthSessionResponse = {
  session: { userId: string; email: string; userName: string | null } | null
  roles: string[]
  activeRole: string | null
}

function KepalaSubBagianUmumDashboard() {
  const [stats, setStats] = useState<Stats>({ inbox: 0, aktif: 0, inaktif: 0, usulMusnah: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkAuth() {
      try {
        const auth = await apiFetch<AuthSessionResponse>('/auth/session')
        if (!auth.session) { window.location.href = '/login'; return }
        if (!auth.roles.includes(ROLES.KEPALA_SUB_BAGIAN_UMUM)) { window.location.href = '/forbidden'; return }
      } catch {
        window.location.href = '/login'
      }
    }
    checkAuth()
  }, [])

  useEffect(() => {
    async function fetchStats() {
      setLoading(true)
      try {
        const [inboxJson, aktifJson, inaktifJson, musnahJson] = await Promise.all([
          apiFetch<InboxStatsResponse>('/arsiparis/inbox').catch(() => ({ inbox: [] })),
          apiFetch<BerkasStatsResponse>('/arsiparis/berkas', {
            query: {
              status_berkas: 'CLOSED',
              status_arsip: 'AKTIF',
            },
          }).catch(() => ({ summary: { total_rows_returned: 0 } })),
          apiFetch<BerkasStatsResponse>('/arsiparis/berkas', {
            query: {
              status_berkas: 'CLOSED',
              status_arsip: 'INAKTIF',
            },
          }).catch(() => ({ summary: { total_rows_returned: 0 } })),
          apiFetch<BerkasStatsResponse>('/arsiparis/berkas', {
            query: {
              status_berkas: 'CLOSED',
              status_arsip: 'USUL_MUSNAH',
            },
          }).catch(() => ({ summary: { total_rows_returned: 0 } })),
        ])
        setStats({
          inbox: (inboxJson.inbox ?? []).length,
          aktif: aktifJson.summary?.total_rows_returned ?? 0,
          inaktif: inaktifJson.summary?.total_rows_returned ?? 0,
          usulMusnah: musnahJson.summary?.total_rows_returned ?? 0,
        })
      } catch {
        // Silent: dashboard counts are non-authoritative entry summaries.
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  const statCards = [
    {
      label: 'Pengklasifikasian Dokumen',
      value: stats.inbox,
      icon: Clock,
      href: '/arsiparis/inbox',
      helper: 'Dokumen selesai PPSPM yang menunggu Jenis Pembayaran.',
    },
    {
      label: 'Pemberkasan Arsip Aktif',
      value: stats.aktif,
      icon: FolderOpen,
      href: '/arsiparis/berkas',
      helper: 'Berkas terbuka dan berkas aktif yang sudah ditutup.',
    },
    {
      label: 'Arsip Inaktif',
      value: stats.inaktif,
      icon: Archive,
      href: '/arsiparis/inaktif',
      helper: 'Berkas tertutup dengan status lifecycle Inaktif.',
    },
    {
      label: 'Usul Musnah',
      value: stats.usulMusnah,
      icon: XCircle,
      href: '/arsiparis/usul-musnah',
      helper: 'Berkas tertutup yang menunggu konfirmasi pemusnahan.',
    },
  ]

  return (
    <DashboardShell role={ROLES.KEPALA_SUB_BAGIAN_UMUM}>
      <div className="space-y-6">
        <ArchivePageHeader
          eyebrow={
            <>
              <Archive size={13} />
              Kepala Sub Bagian Umum
            </>
          }
          title="Ruang Kerja Arsip Folder-First"
          description="Pantau dokumen yang perlu diklasifikasikan, kelola Penambahan Dokumen, dan lanjutkan lifecycle berkas dari Arsip Aktif sampai Usul Musnah."
          actions={
            <>
              <a
                href="/arsiparis/inbox"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-orange-700"
              >
                <Tags size={16} />
                Pengklasifikasian
              </a>
              <a
                href="/arsiparis/penambahan-arsip"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-4 text-sm font-bold text-orange-800 shadow-sm transition hover:bg-orange-50"
              >
                <Plus size={16} />
                Penambahan Dokumen
              </a>
            </>
          }
        />

        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-orange-100 bg-white py-12 shadow-sm">
            <Loader2 size={24} className="animate-spin text-orange-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {statCards.map((stat) => {
              const Icon = stat.icon
              return (
                <a
                  key={stat.href}
                  href={stat.href}
                  className="group block transition hover:-translate-y-0.5"
                >
                  <ArchiveSummaryCard
                    label={stat.label}
                    value={stat.value}
                    helper={stat.helper}
                    icon={<Icon size={20} />}
                    className="h-full transition group-hover:border-orange-200 group-hover:shadow-md"
                  />
                </a>
              )
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
