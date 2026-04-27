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
import { getBrowserClient } from '#/lib/supabase-browser'
import {
  getAllFungsi,
  getKegiatanByFungsi,
  getAllJenis,
  getKategoriByJenis,
  getDetailByKategori,
  type FungsiRow,
  type KegiatanRow,
  type JenisRow,
  type KategoriRow,
  type DetailRow,
} from '#/lib/master-data'
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HierarchicalFilter({ value, onChange, showDateRange = true }: Props) {
  const supabase = getBrowserClient()

  const [fungsis, setFungsis] = useState<FungsiRow[]>([])
  const [kegiatans, setKegiatans] = useState<KegiatanRow[]>([])
  const [jenisList, setJenisList] = useState<JenisRow[]>([])
  const [kategoriList, setKategoriList] = useState<KategoriRow[]>([])
  const [detailList, setDetailList] = useState<DetailRow[]>([])

  // Init: load Fungsi & Jenis
  useEffect(() => {
    getAllFungsi(supabase).then(data => setFungsis(data))
    getAllJenis(supabase).then(data => setJenisList(data))
  }, [])

  // Kegiatan: muncul setelah Fungsi dipilih
  useEffect(() => {
    if (value.fungsiId) {
      getKegiatanByFungsi(supabase, value.fungsiId).then(data => setKegiatans(data ?? []))
    } else {
      setKegiatans([])
    }
  }, [value.fungsiId])

  // Kategori: muncul setelah Jenis dipilih
  useEffect(() => {
    if (value.jenisId) {
      getKategoriByJenis(supabase, value.jenisId).then(data => setKategoriList(data ?? []))
    } else {
      setKategoriList([])
      setDetailList([])
    }
  }, [value.jenisId])

  // Detail: muncul setelah Kategori dipilih
  useEffect(() => {
    if (value.kategoriId) {
      getDetailByKategori(supabase, value.kategoriId).then(data => setDetailList(data ?? []))
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
