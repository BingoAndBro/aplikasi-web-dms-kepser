import {
  Archive,
  BadgeCheck,
  Banknote,
  BarChart3,
  Building2,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  FileCheck,
  FileEdit,
  FilePlus,
  FileText,
  FileX,
  FolderCheck,
  FolderOpen,
  History,
  LayoutDashboard,
  Network,
  Settings,
  Shield,
  Tag,
  Trash2,
  UserCircle,
} from 'lucide-react'

import { ROLE_DEFAULT_ROUTE, ROUTES } from '#/lib/constants/routes'

import type { RoleName } from '#/lib/types/auth'

export type NavItem = {
  id: string
  label: string
  icon: React.ElementType
  to?: string
  badge?: number
}

export type MenuGroup = {
  title: string
  items: NavItem[]
}

export { ROLE_DEFAULT_ROUTE }

export const NAV_CONFIG: Record<RoleName, MenuGroup[]> = {
  PEGAWAI: [
    {
      title: 'GENERAL',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: ROUTES.PEGAWAI.ROOT }],
    },
    {
      title: 'MANAGEMENT',
      items: [
        { id: 'aju', label: 'Ajukan Dokumen', icon: FilePlus, to: ROUTES.PEGAWAI.AJU_DOKUMEN },
        { id: 'diajukan', label: 'Dokumen Diajukan', icon: ClipboardList, to: ROUTES.PEGAWAI.DOKUMEN },
        { id: 'revisi', label: 'Revisi Dokumen', icon: FileEdit, to: ROUTES.PEGAWAI.REVISI },
        { id: 'laporan_saya', label: 'Laporan Saya', icon: FileText, to: ROUTES.PEGAWAI.LAPORAN_SAYA },
      ],
    },
    {
      title: 'PJ Kegiatan',
      items: [
        { id: 'laporan_kegiatan', label: 'Laporan Kegiatan', icon: BarChart3, to: ROUTES.PEGAWAI.LAPORAN_KEGIATAN },
        { id: 'pembersihan_dokumen', label: 'Pembersihan Dokumen', icon: Trash2, to: ROUTES.PEGAWAI.PEMBERSIHAN_DOKUMEN },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'profile', label: 'Profil', icon: UserCircle, to: ROUTES.PROFILE },
        { id: 'history', label: 'Activity Log', icon: History, to: ROUTES.PEGAWAI.ACTIVITY_LOG },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
  PPK: [
    {
      title: 'GENERAL',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: ROUTES.PPK.ROOT }],
    },
    {
      title: 'VALIDASI',
      items: [
        { id: 'validasi', label: 'Validasi Dokumen', icon: BadgeCheck, to: ROUTES.PPK.INBOX },
        { id: 'tervalidasi', label: 'Dokumen Tervalidasi', icon: ClipboardCheck, to: ROUTES.PPK.TERVALIDASI },
        { id: 'ditolak', label: 'Dokumen Tidak Valid', icon: FileX, to: ROUTES.PPK.DITOLAK },
        { id: 'revisi', label: 'Revisi Dokumen', icon: FileEdit, to: ROUTES.PPK.REVISI },
      ],
    },
    {
      title: 'MONITORING',
      items: [
        {
          id: 'monitoring_realisasi',
          label: 'Nominal Realisasi',
          icon: BarChart3,
          to: ROUTES.PPK.MONITORING_REALISASI,
        },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'profile', label: 'Profil', icon: UserCircle, to: ROUTES.PROFILE },
        { id: 'history', label: 'Activity Log', icon: History, to: ROUTES.PPK.ACTIVITY_LOG },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
  PPSPM: [
    {
      title: 'GENERAL',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: ROUTES.PPSPM.ROOT }],
    },
    {
      title: 'PERSETUJUAN',
      items: [
        { id: 'persetujuan', label: 'Persetujuan Dokumen', icon: Banknote, to: ROUTES.PPSPM.INBOX },
        { id: 'ditolak', label: 'Dokumen Ditolak', icon: FileX, to: ROUTES.PPSPM.DITOLAK },
        { id: 'selesai', label: 'Dokumen Selesai', icon: CheckSquare, to: ROUTES.PPSPM.SELESAI },
      ],
    },
    {
      title: 'MONITORING',
      items: [
        {
          id: 'monitoring_realisasi',
          label: 'Nominal Realisasi',
          icon: BarChart3,
          to: ROUTES.PPSPM.MONITORING_REALISASI,
        },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'profile', label: 'Profil', icon: UserCircle, to: ROUTES.PROFILE },
        { id: 'history', label: 'Activity Log', icon: History, to: ROUTES.PPSPM.ACTIVITY_LOG },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
  KEPALA_SUB_BAGIAN_UMUM: [
    {
      title: 'GENERAL',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.ROOT }],
    },
    {
      title: 'PEMBERKASAN',
      items: [
        { id: 'pemberkasan', label: 'Pengklasifikasian Dokumen', icon: Archive, to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.INBOX },
        { id: 'penambahan_arsip', label: 'Penambahan Dokumen', icon: FilePlus, to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.PENAMBAHAN_ARSIP },
        { id: 'arsip_aktif', label: 'Berkas Terbuka', icon: FolderOpen, to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.BERKAS_AKTIF },
        { id: 'berkas_tertutup', label: 'Berkas Tertutup', icon: FolderCheck, to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.BERKAS_TERTUTUP },
        { id: 'pembersihan', label: 'Pembersihan Berkas', icon: Trash2, to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.PEMBERSIHAN },
        { id: 'klasifikasi', label: 'Master Klasifikasi Dokumen', icon: Network, to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.KLASIFIKASI },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'profile', label: 'Profil', icon: UserCircle, to: ROUTES.PROFILE },
        { id: 'history', label: 'Activity Log', icon: History, to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.ACTIVITY_LOG },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
  PENANGGUNG_JAWAB_KINERJA: [
    {
      title: 'GENERAL',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: ROUTES.PENANGGUNG_JAWAB_KINERJA.ROOT }],
    },
    {
      title: 'KINERJA',
      items: [
        {
          id: 'laporan_kinerja',
          label: 'Laporan Kinerja',
          icon: BarChart3,
          to: ROUTES.PENANGGUNG_JAWAB_KINERJA.LAPORAN_KINERJA,
        },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'profile', label: 'Profil', icon: UserCircle, to: ROUTES.PROFILE },
        { id: 'history', label: 'Activity Log', icon: History, to: ROUTES.PENANGGUNG_JAWAB_KINERJA.ACTIVITY_LOG },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
  ADMIN: [
    {
      title: 'GENERAL',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: ROUTES.ADMIN.ROOT }],
    },
    {
      title: 'MANAJEMEN SISTEM',
      items: [
        { id: 'master_user', label: 'Master User', icon: Shield, to: ROUTES.ADMIN.MASTER_USER },
        { id: 'master_fungsi', label: 'Departemen Fungsi', icon: Building2, to: ROUTES.ADMIN.MASTER_FUNGSI },
        { id: 'master_kegiatan', label: 'Master Kegiatan', icon: ClipboardList, to: ROUTES.ADMIN.MASTER_KEGIATAN },
        { id: 'master_komponen', label: 'Master Komponen', icon: ClipboardList, to: ROUTES.ADMIN.MASTER_KOMPONEN },
      ],
    },
    {
      title: 'REFERENSI DOKUMEN',
      items: [
        { id: 'master_jenis', label: 'Jenis Permintaan', icon: Tag, to: ROUTES.ADMIN.MASTER_JENIS },
        { id: 'master_jenis_dokumen', label: 'Jenis Dokumen', icon: Tag, to: ROUTES.ADMIN.MASTER_JENIS_DOKUMEN },
        { id: 'master_kategori', label: 'Kategori Permintaan', icon: Tag, to: ROUTES.ADMIN.MASTER_KATEGORI },
        { id: 'master_detail', label: 'Detail Permintaan', icon: Tag, to: ROUTES.ADMIN.MASTER_DETAIL },
        { id: 'master_kelengkapan', label: 'Kelengkapan Dokumen', icon: FileCheck, to: ROUTES.ADMIN.MASTER_KELENGKAPAN },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'profile', label: 'Profil', icon: UserCircle, to: ROUTES.PROFILE },
        { id: 'history', label: 'Activity Log', icon: History, to: ROUTES.ADMIN.ACTIVITY_LOG },
        { id: 'settings', label: 'Settings', icon: Settings, to: ROUTES.ADMIN.SETTINGS },
      ],
    },
  ],
}
