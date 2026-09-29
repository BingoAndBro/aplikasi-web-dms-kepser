import { sql } from 'drizzle-orm'

import { berkasArsip, berkasArsipItem, manualArsip } from '#/db/schema/arsip'

/**
 * Status arsip dokumen tambahan KSBU (D-29): selalu mengikuti status arsip
 * berkas yang menaunginya, sama seperti dokumen alur pengajuan. Keduanya tidak
 * punya kolom status arsip sendiri (kolom milik manual_arsip dihapus di migrasi
 * 0021). Pemusnahan, penginaktifan, dan usul musnah dilakukan KSBU di tingkat
 * berkas. Selama berkasnya masih TERBUKA (status arsip berkas NULL) atau
 * dokumen belum masuk berkas, statusnya AKTIF.
 *
 * Satu dokumen manual hanya bisa berada di satu berkas
 * (`berkas_arsip_item_manual_arsip_id_unique`). Subquery memakai alias
 * eksplisit supaya referensi ke baris luar (`manual_arsip`) tidak tertukar
 * dengan tabel di dalam subquery, baik di SELECT maupun UPDATE.
 */
export const manualArsipEffectiveStatusArsip = sql<string>`coalesce((
  select ba.status_arsip
  from ${berkasArsipItem} bai
  inner join ${berkasArsip} ba on ba.id = bai.berkas_id
  where bai.manual_arsip_id = ${manualArsip}.id
  limit 1
), 'AKTIF')`
