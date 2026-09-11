/**
 * HierarchicalFilter — Filter bertahap dokumen laporan.
 * Urutan: Fungsi → Kegiatan → Komponen → Jenis → Kategori → Detail
 * Tiap level hanya muncul setelah level sebelumnya dipilih.
 *
 * Dipakai di: Laporan Saya & Laporan Kegiatan
 */
import { useEffect, useState } from 'react'
import { Label } from '#/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Button } from '#/components/ui/button'
import { DatePicker } from '#/components/ui/date-picker'
import { apiFetch } from '#/lib/api-client'
import { X } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HierarchicalFilterValue {
  fungsiId?: string
  kegiatanId?: string
  komponenId?: string
  jenisId?: string
  kategoriId?: string
  detailId?: string
  tanggalMulai?: string
  tanggalAkhir?: string
}

interface Props {
  value: HierarchicalFilterValue
  onChange: (val: HierarchicalFilterValue) => void
  showDateRange?: boolean
}

type MasterOptionRow = {
  id: string
  nama: string
  deskripsi?: string | null
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

type FungsiOption = MasterOptionRow

type KegiatanOption = MasterOptionRow & {
  fungsi_id: string
  fungsi_nama?: string
  master_fungsi?: { id?: string; nama: string | null } | null
}

type KomponenOption = MasterOptionRow & {
  kegiatan_id: string
  kegiatan_nama?: string
  master_kegiatan?: { id?: string; nama: string | null } | null
}

type JenisOption = MasterOptionRow & {
  komponen_id: string
  komponen_nama?: string
  master_komponen?: { id?: string; nama: string | null } | null
}

type KategoriOption = MasterOptionRow & {
  jenis_permintaan_id: string
  jenis_nama?: string
  master_jenis_permintaan?: { id?: string; nama: string | null } | null
}

type DetailOption = MasterOptionRow & {
  kategori_permintaan_id: string
  kategori_nama?: string
  jenis_nama?: string
  master_kategori_permintaan?: {
    id?: string
    nama: string | null
    master_jenis_permintaan?: { nama: string | null } | null
  } | null
}

async function fetchMasterList<T>(
  endpoint: string,
  label: string,
  query?: Record<string, string>,
): Promise<T[]> {
  try {
    return await apiFetch<T[]>(endpoint, query ? { query } : undefined)
  } catch (error) {
    console.error(`[HierarchicalFilter] Gagal mengambil ${label}:`, error)
    return []
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HierarchicalFilter({ value, onChange, showDateRange = true }: Props) {
  const [fungsis, setFungsis] = useState<FungsiOption[]>([])
  const [kegiatans, setKegiatans] = useState<KegiatanOption[]>([])
  const [komponenList, setKomponenList] = useState<KomponenOption[]>([])
  const [jenisList, setJenisList] = useState<JenisOption[]>([])
  const [kategoriList, setKategoriList] = useState<KategoriOption[]>([])
  const [detailList, setDetailList] = useState<DetailOption[]>([])

  // Init: load Fungsi
  useEffect(() => {
    fetchMasterList<FungsiOption>('/master-fungsi', 'fungsi').then(data => setFungsis(data))
  }, [])

  // Kegiatan: muncul setelah Fungsi dipilih
  useEffect(() => {
    if (value.fungsiId) {
      fetchMasterList<KegiatanOption>(
        '/master-kegiatan',
        'kegiatan',
        { fungsi_id: value.fungsiId },
      ).then(data => setKegiatans(data))
    } else {
      setKegiatans([])
    }
  }, [value.fungsiId])

  // Komponen: muncul setelah Kegiatan dipilih
  useEffect(() => {
    if (value.kegiatanId) {
      fetchMasterList<KomponenOption>(
        '/master-komponen',
        'komponen',
        { kegiatan_id: value.kegiatanId },
      ).then(data => setKomponenList(data))
    } else {
      setKomponenList([])
    }
  }, [value.kegiatanId])

  // Jenis Permintaan: muncul setelah Komponen dipilih
  useEffect(() => {
    if (value.komponenId) {
      fetchMasterList<JenisOption>(
        '/master-jenis',
        'jenis permintaan',
        { komponen_id: value.komponenId },
      ).then(data => setJenisList(data))
    } else {
      setJenisList([])
      setKategoriList([])
      setDetailList([])
    }
  }, [value.komponenId])

  // Kategori: muncul setelah Jenis dipilih
  useEffect(() => {
    if (value.jenisId) {
      fetchMasterList<KategoriOption>(
        '/master-kategori',
        'kategori permintaan',
        { jenis_id: value.jenisId },
      ).then(data => setKategoriList(data))
    } else {
      setKategoriList([])
      setDetailList([])
    }
  }, [value.jenisId])

  // Detail: muncul setelah Kategori dipilih
  useEffect(() => {
    if (value.kategoriId) {
      fetchMasterList<DetailOption>(
        '/master-detail',
        'detail permintaan',
        { kategori_id: value.kategoriId },
      ).then(data => setDetailList(data))
    } else {
      setDetailList([])
    }
  }, [value.kategoriId])

  function handleFungsi(fungsiId: string) {
    onChange({
      ...value,
      fungsiId,
      kegiatanId: undefined,
      komponenId: undefined,
      jenisId: undefined,
      kategoriId: undefined,
      detailId: undefined,
    })
  }
  function handleKegiatan(kegiatanId: string) {
    onChange({ ...value, kegiatanId, komponenId: undefined, jenisId: undefined, kategoriId: undefined, detailId: undefined })
  }
  function handleKomponen(komponenId: string) {
    onChange({ ...value, komponenId, jenisId: undefined, kategoriId: undefined, detailId: undefined })
  }
  function handleJenis(jenisId: string) {
    onChange({ ...value, jenisId, kategoriId: undefined, detailId: undefined })
  }
  function handleKategori(kategoriId: string) {
    onChange({ ...value, kategoriId, detailId: undefined })
  }
  function handleDetail(detailId: string) {
    onChange({ ...value, detailId })
  }
  function handleReset() {
    onChange({})
  }

  const hasAnyFilter = !!(
    value.fungsiId || value.kegiatanId || value.komponenId || value.jenisId ||
    value.kategoriId || value.detailId ||
    value.tanggalMulai || value.tanggalAkhir
  )

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">Filter Dokumen</p>
        {hasAnyFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Reset Filter
          </Button>
        )}
      </div>

      {/* Row 1: Fungsi + Kegiatan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Fungsi</Label>
          <Select
            value={value.fungsiId ?? ''}
            onValueChange={v => handleFungsi((v ?? '') === '_all' ? '' : (v ?? ''))}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Semua Fungsi">
                {value.fungsiId && fungsis.length > 0
                  ? fungsis.find(f => f.id === value.fungsiId)?.nama ?? value.fungsiId
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Semua Fungsi</SelectItem>
              {fungsis.map(f => (
                <SelectItem key={f.id} value={f.id}>{f.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stays mounted (hidden, not removed) so an open popup here never gets force-unmounted by an
            unrelated state change (e.g. clearing Fungsi) — see RP-04. */}
        <div className="space-y-1.5" hidden={!value.fungsiId}>
          <Label className="text-xs">Kegiatan</Label>
          <Select
            value={value.kegiatanId ?? ''}
            onValueChange={v => handleKegiatan((v ?? '') === '_all' ? '' : (v ?? ''))}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Semua Kegiatan">
                {value.kegiatanId && kegiatans.length > 0
                  ? kegiatans.find(k => k.id === value.kegiatanId)?.nama ?? value.kegiatanId
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Semua Kegiatan</SelectItem>
              {kegiatans.map(k => (
                <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2: Komponen + Jenis Permintaan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5" hidden={!value.kegiatanId}>
          <Label className="text-xs">Komponen</Label>
          <Select
            value={value.komponenId ?? ''}
            onValueChange={v => handleKomponen((v ?? '') === '_all' ? '' : (v ?? ''))}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Semua Komponen">
                {value.komponenId && komponenList.length > 0
                  ? komponenList.find(c => c.id === value.komponenId)?.nama ?? value.komponenId
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Semua Komponen</SelectItem>
              {komponenList.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5" hidden={!value.komponenId}>
          <Label className="text-xs">Jenis Permintaan</Label>
          <Select
            value={value.jenisId ?? ''}
            onValueChange={v => handleJenis((v ?? '') === '_all' ? '' : (v ?? ''))}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Semua Jenis">
                {value.jenisId && jenisList.length > 0
                  ? jenisList.find(j => j.id === value.jenisId)?.nama ?? value.jenisId
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Semua Jenis</SelectItem>
              {jenisList.map(j => (
                <SelectItem key={j.id} value={j.id}>{j.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 3: Kategori */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5" hidden={!value.jenisId}>
          <Label className="text-xs">Kategori Permintaan</Label>
          <Select
            value={value.kategoriId ?? ''}
            onValueChange={v => handleKategori((v ?? '') === '_all' ? '' : (v ?? ''))}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Semua Kategori">
                {value.kategoriId && kategoriList.length > 0
                  ? kategoriList.find(k => k.id === value.kategoriId)?.nama ?? value.kategoriId
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Semua Kategori</SelectItem>
              {kategoriList.map(k => (
                <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 4: Detail (jika ada) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" hidden={!value.kategoriId || detailList.length === 0}>
        <div className="space-y-1.5">
          <Label className="text-xs">Detail Permintaan</Label>
          <Select
            value={value.detailId ?? ''}
            onValueChange={v => handleDetail((v ?? '') === '_all' ? '' : (v ?? ''))}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Semua Detail">
                {value.detailId && detailList.length > 0
                  ? detailList.find(d => d.id === value.detailId)?.nama ?? value.detailId
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Semua Detail</SelectItem>
              {detailList.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 5: Date Range */}
      {showDateRange && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tanggal Mulai (Dari)</Label>
            <DatePicker
              value={value.tanggalMulai ?? ''}
              onChange={tanggal => onChange({ ...value, tanggalMulai: tanggal || undefined })}
              placeholder="Pilih tanggal mulai"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tanggal Mulai (Sampai)</Label>
            <DatePicker
              value={value.tanggalAkhir ?? ''}
              onChange={tanggal => onChange({ ...value, tanggalAkhir: tanggal || undefined })}
              placeholder="Pilih tanggal selesai"
            />
          </div>
        </div>
      )}
    </div>
  )
}
