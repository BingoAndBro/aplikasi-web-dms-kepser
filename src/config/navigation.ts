import {
  Archive,
  ArchiveX,
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
  FolderOpen,
  History,
  LayoutDashboard,
  Network,
  Search,
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
        { id: 'laporan_kegiatan', label: 'Laporan Kegiatan', icon: BarChart3, to: ROUTES.PEGAWAI.LAPORAN_KEGIATAN },
      ],
    },
    {
      title: 'ARSIP',
      items: [
        { id: 'arsip', label: 'Cari Arsip', icon: Archive, to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.SEARCH },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'profile', label: 'Profil', icon: UserCircle, to: ROUTES.PROFILE },
        { id: 'history', label: 'Activity Log', icon: History },
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
      title: 'ARSIP',
      items: [
        { id: 'arsip', label: 'Cari Arsip', icon: Archive, to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.SEARCH },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'profile', label: 'Profil', icon: UserCircle, to: ROUTES.PROFILE },
        { id: 'history', label: 'Activity Log', icon: History },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
  BENDAHARA: [
    {
      title: 'GENERAL',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: ROUTES.BENDAHARA.ROOT }],
    },
    {
      title: 'PERSETUJUAN',
      items: [
        { id: 'persetujuan', label: 'Persetujuan Dokumen', icon: Banknote, to: ROUTES.BENDAHARA.INBOX },
        { id: 'ditolak', label: 'Dokumen Ditolak', icon: FileX, to: ROUTES.BENDAHARA.DITOLAK },
        { id: 'selesai', label: 'Dokumen Selesai', icon: CheckSquare, to: ROUTES.BENDAHARA.SELESAI },
      ],
    },
    {
      title: 'ARSIP',
      items: [
        { id: 'arsip', label: 'Cari Arsip', icon: Archive, to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.SEARCH },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'profile', label: 'Profil', icon: UserCircle, to: ROUTES.PROFILE },
        { id: 'history', label: 'Activity Log', icon: History },
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
        { id: 'pemberkasan', label: 'Pemberkasan Arsip', icon: Archive, to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.INBOX },
        { id: 'arsip_aktif', label: 'Daftar Arsip Aktif', icon: FolderOpen, to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.AKTIF },
        { id: 'arsip_inaktif', label: 'Daftar Arsip Inaktif', icon: ArchiveX, to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.INAKTIF },
        { id: 'usul_musnah', label: 'Usul Musnah', icon: Trash2, to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.USUL_MUSNAH },
        { id: 'klasifikasi', label: 'Master Klasifikasi', icon: Network, to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.KLASIFIKASI },
        { id: 'arsip_search', label: 'Pencarian Arsip', icon: Search, to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.SEARCH },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'profile', label: 'Profil', icon: UserCircle, to: ROUTES.PROFILE },
        { id: 'history', label: 'Activity Log', icon: History },
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
      title: 'MANAGEMENT',
      items: [
        { id: 'master_user', label: 'Master User', icon: Shield, to: ROUTES.ADMIN.MASTER_USER },
        { id: 'master_fungsi', label: 'Departemen Fungsi', icon: Building2, to: ROUTES.ADMIN.MASTER_FUNGSI },
        { id: 'master_kegiatan', label: 'Master Kegiatan', icon: ClipboardList, to: ROUTES.ADMIN.MASTER_KEGIATAN },
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
        { id: 'history', label: 'Activity Log', icon: History },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
}
