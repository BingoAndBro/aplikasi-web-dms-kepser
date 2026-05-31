import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { apiFetch } from '#/lib/api-client'
import { DashboardShell } from '#/components/dashboard/DashboardShell'
import { ROLES } from '#/lib/constants/roles'
import { motion } from 'framer-motion'
import { Clock, FolderOpen, Archive, XCircle, Loader2 } from 'lucide-react'

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

type InaktifStatsResponse = {
  inaktif?: unknown[]
}

type UsulMusnahStatsResponse = {
  usul_musnah?: unknown[]
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
          apiFetch<InaktifStatsResponse>('/arsiparis/inaktif').catch(() => ({ inaktif: [] })),
          apiFetch<UsulMusnahStatsResponse>('/arsiparis/usul-musnah').catch(() => ({ usul_musnah: [] })),
        ])
        setStats({
          inbox: (inboxJson.inbox ?? []).length,
          aktif: aktifJson.summary?.total_rows_returned ?? 0,
          inaktif: (inaktifJson.inaktif ?? []).length,
          usulMusnah: (musnahJson.usul_musnah ?? []).length,
        })
      } catch {
        // silent — stats stay at 0
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  const statCards = [
    { label: 'Menunggu Arsip', value: stats.inbox, icon: Clock, color: 'text-primary', key: 'inbox' },
    { label: 'Pemberkasan Arsip Aktif', value: stats.aktif, icon: FolderOpen, color: 'text-green-500', key: 'aktif' },
    { label: 'Arsip Inaktif', value: stats.inaktif, icon: Archive, color: 'text-orange-500', key: 'inaktif' },
    { label: 'Usul Musnah', value: stats.usulMusnah, icon: XCircle, color: 'text-error', key: 'usulMusnah' },
  ]

  return (
    <DashboardShell role={ROLES.KEPALA_SUB_BAGIAN_UMUM}>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : (
        <motion.div
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
          }}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"
        >
          {statCards.map((stat) => {
            const Icon = stat.icon
            return (
              <motion.div
                key={stat.key}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0 },
                }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="bg-white/5 backdrop-blur-xl p-6 rounded-2xl border border-white/10 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 group relative overflow-hidden cursor-pointer"
                onClick={() => {
                  if (stat.key === 'inbox') window.location.href = '/arsiparis/inbox'
                  else if (stat.key === 'aktif') window.location.href = '/arsiparis/berkas'
                  else if (stat.key === 'inaktif') window.location.href = '/arsiparis/inaktif'
                  else if (stat.key === 'usulMusnah') window.location.href = '/arsiparis/usul-musnah'
                }}
              >
                <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-bl-full -mr-6 -mt-6 transition-transform group-hover:scale-125 duration-500" />
                <div className="flex items-start justify-between relative">
                  <div>
                    <p className="text-[10px] font-black text-on-surface-variant/60 uppercase tracking-[0.15em] mb-3">
                      {stat.label}
                    </p>
                    <h3 className={`text-3xl font-headline font-black text-on-surface ${stat.color}`}>
                      {stat.value !== null ? (loading ? '—' : stat.value) : '→'}
                    </h3>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all duration-300">
                    <Icon size={22} className={stat.color} />
                  </div>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      )}
    </DashboardShell>
  )
}
