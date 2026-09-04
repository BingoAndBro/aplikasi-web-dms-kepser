/**
 * Stats Bento Grid — shared across all role dashboards.
 * Shows role-specific quick-stats in a glassmorphism bento layout.
 */
import { motion } from 'framer-motion'
import {
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Archive,
  Users,
  Shield,
  Building2,
  ClipboardList,
  FileCheck,
  FolderOpen,
} from 'lucide-react'
import type { RoleName } from '#/lib/types/auth'

type StatCard = {
  label: string
  value: string | number
  trend?: string
  trendDir?: 'up' | 'down' | 'neutral'
  icon: React.ElementType
  color?: string
}

type BentoConfig = {
  stats: StatCard[]
  chart?: boolean
}

const BENTO_CONFIGS: Record<RoleName, BentoConfig> = {
  PEGAWAI: {
    stats: [
      { label: 'Dokumen Diajukan', value: '—', icon: FileText, color: 'text-primary' },
      { label: 'Menunggu Review', value: '—', icon: Clock, color: 'text-amber-500' },
      { label: 'Perlu Revisi', value: '—', icon: XCircle, color: 'text-error' },
      { label: 'Dokumen Selesai', value: '—', icon: CheckCircle, color: 'text-green-500' },
    ],
    chart: false,
  },
  PPK: {
    stats: [
      { label: 'Menunggu Validasi', value: '—', icon: Clock, color: 'text-primary' },
      { label: 'Tervalidasi', value: '—', icon: CheckCircle, color: 'text-green-500' },
      { label: 'Ditolak', value: '—', icon: XCircle, color: 'text-error' },
      { label: 'Revisi', value: '—', icon: FileText, color: 'text-amber-500' },
    ],
    chart: false,
  },
  BENDAHARA: {
    stats: [
      { label: 'Menunggu Persetujuan', value: '—', icon: Clock, color: 'text-primary' },
      { label: 'Disetujui', value: '—', icon: CheckCircle, color: 'text-green-500' },
      { label: 'Ditolak', value: '—', icon: XCircle, color: 'text-error' },
      { label: 'Selesai', value: '—', icon: CheckCircle, color: 'text-blue-500' },
    ],
    chart: false,
  },
  KEPALA_SUB_BAGIAN_UMUM: {
    stats: [
      { label: 'Menunggu Pemberkasan', value: '—', icon: Clock, color: 'text-primary' },
      { label: 'Berkas Terbuka', value: '—', icon: FolderOpen, color: 'text-green-500' },
      { label: 'Usul Pembersihan', value: '—', icon: XCircle, color: 'text-error' },
    ],
    chart: false,
  },
  PENANGGUNG_JAWAB_KINERJA: {
    stats: [
      { label: 'Dokumen Final', value: '—', icon: FileCheck, color: 'text-primary' },
      { label: 'Material', value: '—', icon: ClipboardList, color: 'text-blue-500' },
      { label: 'Non-Material', value: '—', icon: FileText, color: 'text-cyan-500' },
      { label: 'Arsip', value: '—', icon: Archive, color: 'text-green-500' },
    ],
    chart: false,
  },
  ADMIN: {
    stats: [
      { label: 'Total User', value: '—', icon: Users, color: 'text-primary' },
      { label: 'Fungsi', value: '—', icon: Building2, color: 'text-secondary' },
      { label: 'Kegiatan', value: '—', icon: ClipboardList, color: 'text-amber-500' },
      { label: 'Kelengkapan', value: '—', icon: FileCheck, color: 'text-green-500' },
    ],
    chart: false,
  },
}

interface StatsBentoProps {
  role: RoleName
}

export function StatsBento({ role }: StatsBentoProps) {
  const config = BENTO_CONFIGS[role]
  if (!config) return null

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
      }}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      {config.stats.map((stat) => {
        const Icon = stat.icon
        return (
          <motion.div
            key={stat.label}
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0 },
            }}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className="bg-white/5 backdrop-blur-xl p-6 rounded-2xl border border-white/10 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 group relative overflow-hidden"
          >
            {/* Corner accent blob */}
            <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-bl-full -mr-6 -mt-6 transition-transform group-hover:scale-125 duration-500" />

            <div className="flex items-start justify-between relative">
              <div>
                <p className="text-[10px] font-black text-on-surface-variant/60 uppercase tracking-[0.15em] mb-3">
                  {stat.label}
                </p>
                <h3 className={`text-3xl font-headline font-black text-on-surface ${stat.color ?? ''}`}>
                  {stat.value}
                </h3>
                {stat.trend && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="text-[10px] px-2 py-0.5 bg-white/5 rounded-lg font-black uppercase tracking-widest">
                      {stat.trend}
                    </span>
                    {stat.trendDir === 'up' && (
                      <span className="text-[10px] text-green-500 font-bold">↑</span>
                    )}
                    {stat.trendDir === 'down' && (
                      <span className="text-[10px] text-error font-bold">↓</span>
                    )}
                  </div>
                )}
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <Icon size={22} className={stat.color ?? 'text-primary'} />
              </div>
            </div>
          </motion.div>
        )
      })}
    </motion.div>
  )
}
