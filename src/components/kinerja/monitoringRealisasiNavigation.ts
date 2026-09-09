export type MonitoringRealisasiGroupBy = 'kegiatan' | 'pegawai'

export type MonitoringRealisasiSearch = {
  groupBy?: MonitoringRealisasiGroupBy
  pegawaiId?: string
  fungsiId?: string
  kegiatanId?: string
}

export type MonitoringRealisasiHandlers = {
  groupBy: MonitoringRealisasiGroupBy
  pegawaiId?: string
  fungsiId?: string
  kegiatanId?: string
  onSelectGroupBy: (mode: MonitoringRealisasiGroupBy) => void
  onSelectPegawai: (pegawaiId: string | null) => void
  onSelectFungsi: (fungsiId: string | null) => void
  onSelectKegiatan: (fungsiId: string, kegiatanId: string | null) => void
}

/**
 * Builds the navigation props for {@link MonitoringRealisasiView}. The view is
 * shared by the PPK, Bendahara, and Penanggung Jawab Kinerja routes, so the
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
    onSelectGroupBy: (mode) => go(mode === 'pegawai' ? { groupBy: 'pegawai' } : {}),
    onSelectPegawai: (pegawaiId) =>
      go(pegawaiId ? { groupBy: 'pegawai', pegawaiId } : { groupBy: 'pegawai' }),
    onSelectFungsi: (fungsiId) =>
      go(fungsiId ? { ...pegawaiScope, fungsiId } : { ...pegawaiScope }),
    onSelectKegiatan: (fungsiId, kegiatanId) =>
      go(
        kegiatanId
          ? { ...pegawaiScope, fungsiId, kegiatanId }
          : { ...pegawaiScope, fungsiId },
      ),
  }
}
