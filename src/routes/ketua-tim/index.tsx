import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Link } from '@tanstack/react-router'
import { Trophy, FileText, CheckCircle2, Clock, ArrowRight } from 'lucide-react'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/ketua-tim/')({
  component: KetuaTimDashboard,
})

type Stats = {
  total: number
  completed: number
}

function KetuaTimDashboard() {
  const [stats, setStats] = useState<Stats>({ total: 0, completed: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const res = await fetch('/api/ketua-tim/inbox', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          const dokumen = data.dokumen ?? []
          setStats({
            total: dokumen.length,
            completed: dokumen.filter((d: any) => d.status === 'COMPLETED').length,
          })
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  return (
    <PageLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
            <Trophy size={12} />
            <span className="text-primary">Ketua Tim</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">
            Dashboard Ketua Tim
          </h2>
          <p className="text-on-surface-variant text-xs mt-1">
            Kelola dokumen Non-Material untuk kegiatan Anda.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <FileText size={20} className="text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-on-surface">{loading ? "-" : stats.total}</p>
                <p className="text-xs text-on-surface-variant">Menunggu Persetujuan</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle2 size={20} className="text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-on-surface">{loading ? "-" : stats.completed}</p>
                <p className="text-xs text-on-surface-variant">Disetujui</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock size={20} className="text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-on-surface">{loading ? "-" : stats.total - stats.completed}</p>
                <p className="text-xs text-on-surface-variant">Pending</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link to="/ketua-tim/inbox">
            <div className={cn(
              'bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm',
              'hover:border-primary/50 hover:shadow-md transition-all cursor-pointer'
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Trophy size={24} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-on-surface">Pengecekan Dokumen Non-Material</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Lihat dan setujui dokumen Non-Material
                    </p>
                  </div>
                </div>
                <ArrowRight size={20} className="text-outline" />
              </div>
            </div>
          </Link>
        </div>
      </div>
    </PageLayout>
  )
}
