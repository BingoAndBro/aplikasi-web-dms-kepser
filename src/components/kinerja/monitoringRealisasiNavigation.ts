import { normalizePeriodeSearch, type PeriodeValue } from '#/lib/laporan/periode'

export type MonitoringRealisasiGroupBy = 'kegiatan' | 'pegawai'

export type MonitoringRealisasiSearch = {
  groupBy?: MonitoringRealisasiGroupBy
  pegawaiId?: string
  fungsiId?: string
  kegiatanId?: string
  komponenId?: string
  periode?: PeriodeValue['mode']
  tahun?: number
  triwulan?: 1 | 2 | 3 | 4
  dari?: string
  sampai?: string
}

export type MonitoringRealisasiHandlers = {
  groupBy: MonitoringRealisasiGroupBy
  pegawaiId?: string
  fungsiId?: string
  kegiatanId?: string
  komponenId?: string
  periode: PeriodeValue
  onSelectGroupBy: (mode: MonitoringRealisasiGroupBy) => void
  onSelectPegawai: (pegawaiId: string | null) => void
  onSelectFungsi: (fungsiId: string | null) => void
  onSelectKegiatan: (fungsiId: string, kegiatanId: string | null) => void
  onSelectKomponen: (fungsiId: string, kegiatanId: string, komponenId: string | null) => void
  onSelectPeriode: (next: PeriodeValue) => void
}

type PeriodeSearchFields = Pick<MonitoringRealisasiSearch, 'periode' | 'tahun' | 'triwulan' | 'dari' | 'sampai'>

function periodeToSearch(periode: PeriodeValue): PeriodeSearchFields {
  switch (periode.mode) {
    case 'TRIWULAN':
      return { periode: 'TRIWULAN', tahun: periode.tahun, triwulan: periode.triwulan }
    case 'TAHUNAN':
      return { periode: 'TAHUNAN', tahun: periode.tahun }
    case 'SEMUA':
      return { periode: 'SEMUA' }
    case 'KUSTOM':
      return { periode: 'KUSTOM', dari: periode.dari, sampai: periode.sampai }
    default:
      return {}
  }
}

/**
 * Builds the navigation props for {@link MonitoringRealisasiView}. The view is
 * shared by the PPK, Ppspm, and Penanggung Jawab Kinerja routes, so the
 * search-param wiring lives here to keep the three thin wrappers in sync.
 *
 * `go` receives the next search object and is expected to call the route's
 * `navigate({ to, search })`.
 */
export function createMonitoringRealisasiHandlers(
  search: MonitoringRealisasiSearch,
  go: (next: MonitoringRealisasiSearch) => void,
): MonitoringRealisasiHandlers {
  const groupBy: MonitoringRealisasiGroupBy = search.groupBy === 'pegawai' ? 'pegawai' : 'kegiatan'

  const periode = normalizePeriodeSearch({
    mode: search.periode,
    tahun: search.tahun,
    triwulan: search.triwulan,
    dari: search.dari,
    sampai: search.sampai,
  })

  // Every navigation stays on the same periode unless the user explicitly
  // changes it, so the periode fields are spread into every `go()` call
  // alongside the pegawai scope below.
  const periodeScope: PeriodeSearchFields = periodeToSearch(periode)

  // In "pegawai" mode every drilldown level keeps the selected pegawai in the
  // URL so the back navigation lands on that pegawai instead of the root list.
  const pegawaiScope: MonitoringRealisasiSearch =
    groupBy === 'pegawai'
      ? search.pegawaiId
        ? { groupBy: 'pegawai', pegawaiId: search.pegawaiId }
        : { groupBy: 'pegawai' }
      : {}

  return {
    groupBy,
    pegawaiId: search.pegawaiId,
    fungsiId: search.fungsiId,
    kegiatanId: search.kegiatanId,
    komponenId: search.komponenId,
    periode,
    onSelectGroupBy: (mode) =>
      go({ ...periodeScope, ...(mode === 'pegawai' ? { groupBy: 'pegawai' } : {}) }),
    onSelectPegawai: (pegawaiId) =>
      go({ ...periodeScope, ...(pegawaiId ? { groupBy: 'pegawai', pegawaiId } : { groupBy: 'pegawai' }) }),
    onSelectFungsi: (fungsiId) =>
      go(fungsiId ? { ...pegawaiScope, ...periodeScope, fungsiId } : { ...pegawaiScope, ...periodeScope }),
    onSelectKegiatan: (fungsiId, kegiatanId) =>
      go(
        kegiatanId
          ? { ...pegawaiScope, ...periodeScope, fungsiId, kegiatanId }
          : { ...pegawaiScope, ...periodeScope, fungsiId },
      ),
    onSelectKomponen: (fungsiId, kegiatanId, komponenId) =>
      go(
        komponenId
          ? { ...pegawaiScope, ...periodeScope, fungsiId, kegiatanId, komponenId }
          : { ...pegawaiScope, ...periodeScope, fungsiId, kegiatanId },
      ),
    onSelectPeriode: (next) =>
      go({
        ...pegawaiScope,
        fungsiId: search.fungsiId,
        kegiatanId: search.kegiatanId,
        komponenId: search.komponenId,
        ...periodeToSearch(next),
      }),
  }
}
