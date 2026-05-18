/**
 * HierarchicalFilter — Filter bertahap dokumen laporan.
 * Urutan: Fungsi → Kegiatan → Jenis → Kategori → Detail
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
import { apiFetch } from '#/lib/api-client'
import { X } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HierarchicalFilterValue {
  fungsiId?: string
  kegiatanId?: string
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

type JenisOption = MasterOptionRow

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
  const [jenisList, setJenisList] = useState<JenisOption[]>([])
  const [kategoriList, setKategoriList] = useState<KategoriOption[]>([])
  const [detailList, setDetailList] = useState<DetailOption[]>([])

  // Init: load Fungsi & Jenis
  useEffect(() => {
    fetchMasterList<FungsiOption>('/master-fungsi', 'fungsi').then(data => setFungsis(data))
    fetchMasterList<JenisOption>('/master-jenis', 'jenis permintaan').then(data => setJenisList(data))
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
    onChange({ ...value, fungsiId, kegiatanId: undefined })
  }
  function handleKegiatan(kegiatanId: string) {
    onChange({ ...value, kegiatanId })
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
    value.fungsiId || value.kegiatanId || value.jenisId ||
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

        {value.fungsiId && (
          <div className="space-y-1.5">
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
        )}
      </div>

      {/* Row 2: Jenis + Kategori */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
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

        {value.jenisId && (
          <div className="space-y-1.5">
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
        )}
      </div>

      {/* Row 3: Detail (jika ada) */}
      {value.kategoriId && detailList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
      )}

      {/* Row 4: Date Range */}
      {showDateRange && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tanggal Mulai (Dari)</Label>
            <input
              type="date"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={value.tanggalMulai ?? ''}
              onChange={e => onChange({ ...value, tanggalMulai: e.target.value || undefined })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tanggal Mulai (Sampai)</Label>
            <input
              type="date"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={value.tanggalAkhir ?? ''}
              onChange={e => onChange({ ...value, tanggalAkhir: e.target.value || undefined })}
              min={value.tanggalMulai}
            />
          </div>
        </div>
      )}
    </div>
  )
}
