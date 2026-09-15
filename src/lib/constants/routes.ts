import { ROLE_NAMES, type RoleName } from './roles'

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  FORBIDDEN: '/forbidden',
  PROFILE: '/profile',
  API_PREFIX: '/api/',
  PEGAWAI: {
    ROOT: '/pegawai',
    DOKUMEN: '/pegawai/dokumen',
    AJU_DOKUMEN: '/pegawai/dokumen/aju',
    REVISI: '/pegawai/revisi',
    LAPORAN_SAYA: '/pegawai/laporan/saya',
    LAPORAN_KEGIATAN: '/pegawai/laporan/kegiatan',
    PEMBERSIHAN_DOKUMEN: '/pegawai/pembersihan-dokumen',
    ACTIVITY_LOG: '/pegawai/activity-log',
  },
  PPK: {
    ROOT: '/ppk',
    INBOX: '/ppk/inbox',
    TERVALIDASI: '/ppk/tervalidasi',
    DITOLAK: '/ppk/ditolak',
    REVISI: '/ppk/revisi',
    MONITORING_REALISASI: '/ppk/monitoring-realisasi',
    ACTIVITY_LOG: '/ppk/activity-log',
  },
  PPSPM: {
    ROOT: '/ppspm',
    INBOX: '/ppspm/inbox',
    DITOLAK: '/ppspm/ditolak',
    SELESAI: '/ppspm/selesai',
    MONITORING_REALISASI: '/ppspm/monitoring-realisasi',
    ACTIVITY_LOG: '/ppspm/activity-log',
  },
  KEPALA_SUB_BAGIAN_UMUM: {
    ROOT: '/kasubag',
    INBOX: '/kasubag/inbox',
    BERKAS_AKTIF: '/kasubag/berkas',
    BERKAS_TERTUTUP: '/kasubag/berkas/tertutup',
    PEMBERSIHAN: '/kasubag/pembersihan',
    PENAMBAHAN_ARSIP: '/kasubag/penambahan-arsip',
    KLASIFIKASI: '/kasubag/klasifikasi',
    ACTIVITY_LOG: '/kasubag/activity-log',
  },
  PENANGGUNG_JAWAB_KINERJA: {
    ROOT: '/penanggung-jawab-kinerja',
    LAPORAN_KINERJA: '/penanggung-jawab-kinerja/laporan-kinerja',
    ACTIVITY_LOG: '/penanggung-jawab-kinerja/activity-log',
  },
  ADMIN: {
    ROOT: '/admin',
    MASTER_USER: '/admin/master-data/user',
    MASTER_FUNGSI: '/admin/master-data/fungsi',
    MASTER_KEGIATAN: '/admin/master-data/kegiatan',
    MASTER_KOMPONEN: '/admin/master-data/komponen',
    MASTER_JENIS: '/admin/master-data/jenis',
    MASTER_JENIS_DOKUMEN: '/admin/master-data/jenis-dokumen',
    MASTER_KATEGORI: '/admin/master-data/kategori',
    MASTER_DETAIL: '/admin/master-data/detail',
    MASTER_KELENGKAPAN: '/admin/master-data/kelengkapan',
    SETTINGS: '/admin/settings',
    ACTIVITY_LOG: '/admin/activity-log',
  },
  LEGACY_DOKUMEN: {
    ROOT: '/dokumen',
    AJU: '/dokumen/aju',
    SAYA: '/dokumen/saya',
  },
} as const

export const PUBLIC_PATHS = [ROUTES.LOGIN, ROUTES.API_PREFIX] as const

export const ROLE_DEFAULT_ROUTE: Record<RoleName, string> = {
  PEGAWAI: ROUTES.PEGAWAI.ROOT,
  PPK: ROUTES.PPK.ROOT,
  PPSPM: ROUTES.PPSPM.ROOT,
  KEPALA_SUB_BAGIAN_UMUM: ROUTES.KEPALA_SUB_BAGIAN_UMUM.ROOT,
  PENANGGUNG_JAWAB_KINERJA: ROUTES.PENANGGUNG_JAWAB_KINERJA.ROOT,
  ADMIN: ROUTES.ADMIN.ROOT,
}

export function getDefaultRouteForRoles(
  assignedRoles: readonly RoleName[],
  activeUxRole?: RoleName | null,
): string {
  if (activeUxRole && assignedRoles.includes(activeUxRole)) {
    return ROLE_DEFAULT_ROUTE[activeUxRole]
  }

  const firstAssignedRole = ROLE_NAMES.find((role) => assignedRoles.includes(role))
  return firstAssignedRole ? ROLE_DEFAULT_ROUTE[firstAssignedRole] : ROUTES.LOGIN
}

export const MESH_ROUTES = [
  ROUTES.HOME,
  ROUTES.PEGAWAI.ROOT,
  ROUTES.PPK.ROOT,
  ROUTES.PPSPM.ROOT,
  ROUTES.KEPALA_SUB_BAGIAN_UMUM.ROOT,
  ROUTES.PENANGGUNG_JAWAB_KINERJA.ROOT,
  ROUTES.ADMIN.ROOT,
] as const

