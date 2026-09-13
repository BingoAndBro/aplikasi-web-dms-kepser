/**
 * Aesthetic shell for all role dashboards.
 * Wraps role-specific content with mesh blobs, glass panels, and motion.
 */
import { motion } from 'framer-motion'
import type { RoleName } from '#/lib/types/auth'

// BPS Kepulauan Seribu motto
const BPS_MOTTO = '"Mencatat Data, Membangun Negeri"'
const BPS_TAGLINE = 'BPS Kabupaten Kepulauan Seribu — Dukung pengelolaan dokumen dengan tata kelola arsip yang transparan dan akuntabel.'
const BPS_VISION = 'Terintegrasi, Akuntabel, Sejarahan.'

interface DashboardShellProps {
  role: RoleName
  children: React.ReactNode
  /** Hide the hero section (BPS motto, title, CTA) on non-dashboard pages */
  showHero?: boolean
}

const ROLE_LABELS: Record<RoleName, { badge: string; title: string; desc: string; ctaLabel: string; ctaTo: string }> = {
  PEGAWAI: {
    badge: 'PEGAWAI PORTAL',
    title: 'Dashboard',
    desc: 'Selamat datang di ruang kerja Pegawai BPS Kabupaten Kepulauan Seribu.',
    ctaLabel: 'Ajukan Dokumen',
    ctaTo: '/dokumen/aju',
  },
  PPK: {
    badge: 'PPK PORTAL',
    title: 'Dashboard',
    desc: 'Ruang kerja Pejabat Pembuat Komitmen — validasi dan persetujuan dokumen.',
    ctaLabel: 'Validasi Dokumen',
    ctaTo: '/ppk/inbox',
  },
  PPSPM: {
    badge: 'PPSPM PORTAL',
    title: 'Dashboard',
    desc: 'Ruang kerja PPSPM (Pejabat Penandatangan Surat Perintah Membayar) untuk persetujuan pencairan dana kegiatan.',
    ctaLabel: 'Persetujuan Dokumen',
    ctaTo: '/ppspm/inbox',
  },
  KEPALA_SUB_BAGIAN_UMUM: {
    badge: 'KEPALA SUB BAGIAN UMUM PORTAL',
    title: 'Dashboard',
    desc: 'Ruang kerja Kepala Sub Bagian Umum — pengklasifikasian dokumen dan pengelolaan arsip.',
    ctaLabel: 'Pengklasifikasian Dokumen',
    ctaTo: '/kasubag/inbox',
  },
  PENANGGUNG_JAWAB_KINERJA: {
    badge: 'PENANGGUNG JAWAB KINERJA PORTAL',
    title: 'Dashboard',
    desc: 'Ruang kerja Penanggung Jawab Kinerja untuk laporan metadata dokumen final.',
    ctaLabel: 'Laporan Kinerja',
    ctaTo: '/penanggung-jawab-kinerja/laporan-kinerja',
  },
  ADMIN: {
    badge: 'ADMIN PORTAL',
    title: 'Dashboard',
    desc: 'Ruang kerja Administrator — kelola pengguna dan data master aplikasi.',
    ctaLabel: 'Kelola User',
    ctaTo: '/admin/master-data/user',
  },
}

export function DashboardShell({ role, children, showHero = true }: DashboardShellProps) {
  const info = ROLE_LABELS[role]
  const padding = showHero ? 'p-8 space-y-10' : 'px-6 pt-8 pb-6 space-y-6'

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar relative">
      <div className={`${padding} relative z-10 max-w-[1600px] mx-auto`}>
        {/* Hero Section — shown only on role dashboard pages */}
        {showHero && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8"
        >
          <div className="max-w-2xl">
            <span className="text-primary font-headline text-xs font-black uppercase tracking-[0.2em] mb-4 block">
              {info.badge}
            </span>
            <h1 className="font-headline text-5xl lg:text-7xl font-extrabold text-on-surface leading-tight tracking-tighter mb-4">
              {info.title}
            </h1>
            <p className="text-on-surface-variant text-base font-medium mb-2">
              {BPS_MOTTO}
            </p>
            <p className="text-on-surface-variant text-sm max-w-xl">
              {info.desc}
            </p>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-4">
            <motion.a
              href={info.ctaTo}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-primary text-white px-8 py-4 rounded-xl font-headline font-extrabold text-sm shadow-xl shadow-primary/20 flex items-center gap-3 animate-breath uppercase tracking-widest transition-colors hover:text-white"
            >
              {info.ctaLabel}
            </motion.a>
            <p className="text-[10px] text-outline font-bold uppercase tracking-wider">{BPS_VISION}</p>
          </div>
        </motion.div>
        )}

        {/* Content */}
        {children}
      </div>
    </div>
  )
}
