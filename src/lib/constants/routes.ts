import type { RoleName } from './roles'

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
  },
  PPK: {
    ROOT: '/ppk',
    INBOX: '/ppk/inbox',
    TERVALIDASI: '/ppk/tervalidasi',
    DITOLAK: '/ppk/ditolak',
    REVISI: '/ppk/revisi',
  },
  BENDAHARA: {
    ROOT: '/bendahara',
    INBOX: '/bendahara/inbox',
    DITOLAK: '/bendahara/ditolak',
    SELESAI: '/bendahara/selesai',
  },
  ARSIPARIS: {
    ROOT: '/arsiparis',
    INBOX: '/arsiparis/inbox',
    AKTIF: '/arsiparis/aktif',
    INAKTIF: '/arsiparis/inaktif',
    USUL_MUSNAH: '/arsiparis/usul-musnah',
    KLASIFIKASI: '/arsiparis/klasifikasi',
    SEARCH: '/arsiparis/search',
  },
  ADMIN: {
    ROOT: '/admin',
    MASTER_USER: '/admin/master-data/user',
    MASTER_FUNGSI: '/admin/master-data/fungsi',
    MASTER_KEGIATAN: '/admin/master-data/kegiatan',
    MASTER_JENIS: '/admin/master-data/jenis',
    MASTER_JENIS_DOKUMEN: '/admin/master-data/jenis-dokumen',
    MASTER_KATEGORI: '/admin/master-data/kategori',
    MASTER_DETAIL: '/admin/master-data/detail',
    MASTER_KELENGKAPAN: '/admin/master-data/kelengkapan',
  },
  LEGACY_DOKUMEN: {
    ROOT: '/dokumen',
    AJU: '/dokumen/aju',
    SAYA: '/dokumen/saya',
  },
} as const

export const PUBLIC_PATHS = [ROUTES.LOGIN, ROUTES.API_PREFIX] as const

export const ROLE_DEFAULT_ROUTE: Record<RoleName, string> = {
  PEGAWAI: ROUTES.HOME,
  PPK: ROUTES.PPK.ROOT,
  BENDAHARA: ROUTES.BENDAHARA.ROOT,
  ARSIPARIS: ROUTES.ARSIPARIS.ROOT,
  ADMIN: ROUTES.ADMIN.ROOT,
}

export const MESH_ROUTES = [
  ROUTES.HOME,
  ROUTES.PPK.ROOT,
  ROUTES.BENDAHARA.ROOT,
  ROUTES.ARSIPARIS.ROOT,
  ROUTES.ADMIN.ROOT,
] as const

