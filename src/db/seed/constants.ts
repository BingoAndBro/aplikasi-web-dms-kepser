import { ROLES, type RoleName } from '../../lib/constants/roles'

export const SEED_ROLE_IDS: Record<RoleName, string> = {
  PEGAWAI: '11111111-1111-4111-8111-111111111111',
  PPK: '22222222-2222-4222-8222-222222222222',
  BENDAHARA: '33333333-3333-4333-8333-333333333333',
  ARSIPARIS: '44444444-4444-4444-8444-444444444444',
  ADMIN: '55555555-5555-4555-8555-555555555555',
}

export const SEED_USER_IDS = {
  admin: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  pegawai: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ppk: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  bendahara: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  arsiparis: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
} as const

export const SEED_MASTER_IDS = {
  fungsi: '10101010-1010-4010-8010-101010101010',
  kegiatan: '20202020-2020-4020-8020-202020202020',
  jenisPermintaan: '30303030-3030-4030-8030-303030303030',
  kategoriPermintaan: '40404040-4040-4040-8040-404040404040',
  detailPermintaan: '50505050-5050-4050-8050-505050505050',
  jenisDokumen: '60606060-6060-4060-8060-606060606060',
  kelengkapanSuratTugasAnggota: '70707070-7070-4070-8070-707070707071',
  kelengkapanFormPermintaanAnggota: '70707070-7070-4070-8070-707070707072',
  kelengkapanSuratTugasKetua: '70707070-7070-4070-8070-707070707073',
  klasifikasiArsip: '80808080-8080-4080-8080-808080808080',
  ketuaTimAssignment: '90909090-9090-4090-8090-909090909090',
} as const

export const CANONICAL_SEED_ROLES = [
  {
    id: SEED_ROLE_IDS.PEGAWAI,
    nama: ROLES.PEGAWAI,
    description: 'Pegawai pengaju dokumen',
  },
  {
    id: SEED_ROLE_IDS.PPK,
    nama: ROLES.PPK,
    description: 'Pejabat Pembuat Komitmen',
  },
  {
    id: SEED_ROLE_IDS.BENDAHARA,
    nama: ROLES.BENDAHARA,
    description: 'Bendahara pemeriksa dan penyelesai dokumen',
  },
  {
    id: SEED_ROLE_IDS.ARSIPARIS,
    nama: ROLES.ARSIPARIS,
    description: 'Arsiparis pengelola arsip dokumen',
  },
  {
    id: SEED_ROLE_IDS.ADMIN,
    nama: ROLES.ADMIN,
    description: 'Administrator sistem',
  },
] as const

export const DEV_SEED_USERS = [
  {
    key: 'admin',
    id: SEED_USER_IDS.admin,
    email: 'dev.admin@local.test',
    displayName: 'Dev Admin',
    namaLengkap: 'Development Admin',
    roles: [ROLES.ADMIN],
  },
  {
    key: 'pegawai',
    id: SEED_USER_IDS.pegawai,
    email: 'dev.pegawai@local.test',
    displayName: 'Dev Pegawai',
    namaLengkap: 'Development Pegawai',
    roles: [ROLES.PEGAWAI],
  },
  {
    key: 'ppk',
    id: SEED_USER_IDS.ppk,
    email: 'dev.ppk@local.test',
    displayName: 'Dev PPK',
    namaLengkap: 'Development PPK',
    roles: [ROLES.PEGAWAI, ROLES.PPK],
  },
  {
    key: 'bendahara',
    id: SEED_USER_IDS.bendahara,
    email: 'dev.bendahara@local.test',
    displayName: 'Dev Bendahara',
    namaLengkap: 'Development Bendahara',
    roles: [ROLES.PEGAWAI, ROLES.BENDAHARA],
  },
  {
    key: 'arsiparis',
    id: SEED_USER_IDS.arsiparis,
    email: 'dev.arsiparis@local.test',
    displayName: 'Dev Arsiparis',
    namaLengkap: 'Development Arsiparis',
    roles: [ROLES.PEGAWAI, ROLES.ARSIPARIS],
  },
] as const

export const SEED_ENV = {
  devPasswordHash: 'DMS_DEV_SEED_PASSWORD_HASH',
} as const
