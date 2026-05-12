import { eq } from 'drizzle-orm'
import type { db } from '../client'
import { masterKlasifikasiArsip } from '../schema/arsip'
import {
  ketuaTimAssignments,
  masterDetailPermintaan,
  masterFungsi,
  masterJenisDokumen,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
  masterKelengkapanDokumen,
} from '../schema/master'
import { SEED_MASTER_IDS, SEED_USER_IDS } from './constants'

type SeedDb = typeof db

export async function seedMasterData(database: SeedDb) {
  await database
    .insert(masterFungsi)
    .values({
      id: SEED_MASTER_IDS.fungsi,
      nama: 'Dev Fungsi',
      deskripsi: 'Minimal development function for local workflow testing',
      isActive: true,
    })
    .onConflictDoUpdate({
      target: masterFungsi.nama,
      set: { deskripsi: 'Minimal development function for local workflow testing', isActive: true },
    })
  const fungsiId = await findIdByName(database, masterFungsi, masterFungsi.nama, 'Dev Fungsi')

  await database
    .insert(masterKegiatan)
    .values({
      id: SEED_MASTER_IDS.kegiatan,
      fungsiId,
      nama: 'Dev Kegiatan',
      deskripsi: 'Minimal development activity for local workflow testing',
      isActive: true,
    })
    .onConflictDoNothing()
  const kegiatanId = await findIdByName(database, masterKegiatan, masterKegiatan.nama, 'Dev Kegiatan')

  await database
    .insert(masterJenisPermintaan)
    .values({
      id: SEED_MASTER_IDS.jenisPermintaan,
      nama: 'Dev Material',
      deskripsi: 'Minimal material request type for development',
      isActive: true,
    })
    .onConflictDoNothing()
  const jenisPermintaanId = await findIdByName(
    database,
    masterJenisPermintaan,
    masterJenisPermintaan.nama,
    'Dev Material',
  )

  await database
    .insert(masterKategoriPermintaan)
    .values({
      id: SEED_MASTER_IDS.kategoriPermintaan,
      jenisPermintaanId,
      nama: 'Dev Kategori',
      deskripsi: 'Minimal material request category for development',
      isActive: true,
    })
    .onConflictDoNothing()
  const kategoriPermintaanId = await findIdByName(
    database,
    masterKategoriPermintaan,
    masterKategoriPermintaan.nama,
    'Dev Kategori',
  )

  await database
    .insert(masterDetailPermintaan)
    .values({
      id: SEED_MASTER_IDS.detailPermintaan,
      kategoriPermintaanId,
      nama: 'Dev Detail',
      deskripsi: 'Minimal material request detail for development',
      isActive: true,
    })
    .onConflictDoNothing()
  const detailPermintaanId = await findIdByName(
    database,
    masterDetailPermintaan,
    masterDetailPermintaan.nama,
    'Dev Detail',
  )

  await database
    .insert(masterJenisDokumen)
    .values({
      id: SEED_MASTER_IDS.jenisDokumen,
      nama: 'Dev Non-Material',
      deskripsi: 'Minimal non-material document type for development',
      isActive: true,
    })
    .onConflictDoNothing()

  await database
    .insert(masterKelengkapanDokumen)
    .values([
      {
        id: SEED_MASTER_IDS.kelengkapanSuratTugasAnggota,
        kegiatanId,
        isKetuaTim: false,
        namaDokumen: 'Surat Tugas',
        required: true,
        jenisPermintaanId,
        kategoriPermintaanId,
        detailPermintaanId,
      },
      {
        id: SEED_MASTER_IDS.kelengkapanFormPermintaanAnggota,
        kegiatanId,
        isKetuaTim: false,
        namaDokumen: 'Form Permintaan',
        required: true,
        jenisPermintaanId,
        kategoriPermintaanId,
        detailPermintaanId,
      },
      {
        id: SEED_MASTER_IDS.kelengkapanSuratTugasKetua,
        kegiatanId,
        isKetuaTim: true,
        namaDokumen: 'Surat Tugas',
        required: true,
        jenisPermintaanId,
        kategoriPermintaanId,
        detailPermintaanId,
      },
    ])
    .onConflictDoNothing()

  await database
    .insert(masterKlasifikasiArsip)
    .values({
      id: SEED_MASTER_IDS.klasifikasiArsip,
      nama: 'Dev Klasifikasi',
      deskripsi: 'Minimal archive classification for development',
      isActive: true,
      kode: 'DEV',
    })
    .onConflictDoUpdate({
      target: masterKlasifikasiArsip.nama,
      set: {
        deskripsi: 'Minimal archive classification for development',
        isActive: true,
        kode: 'DEV',
      },
    })

  return { kegiatanId }
}

export async function seedKetuaTimFixture(
  database: SeedDb,
  options: { kegiatanId: string; users: { admin: string; ppk: string } | null },
) {
  if (!options.users) {
    console.log('Skipping Ketua Tim assignment fixture because development users were not seeded.')
    return
  }

  const [ppkUser] = await database
    .select({ id: ketuaTimAssignments.userId })
    .from(ketuaTimAssignments)
    .where(eq(ketuaTimAssignments.kegiatanId, options.kegiatanId))
    .limit(1)

  if (ppkUser) {
    return
  }

  await database
    .insert(ketuaTimAssignments)
    .values({
      id: SEED_MASTER_IDS.ketuaTimAssignment,
      userId: options.users.ppk,
      kegiatanId: options.kegiatanId,
      createdBy: options.users.admin,
    })
    .onConflictDoNothing()
}

async function findIdByName<Table extends { id: any }>(
  database: SeedDb,
  table: Table,
  nameColumn: any,
  name: string,
) {
  const [row] = await database.select({ id: table.id }).from(table as any).where(eq(nameColumn, name)).limit(1)

  if (!row?.id) {
    throw new Error(`Failed to verify seeded master data row: ${name}`)
  }

  return row.id as string
}
