/**
 * PeriodeSelector — pemilih periode laporan (Bulanan / Triwulan / Tahunan /
 * Seluruh Periode / Kustom).
 *
 * Dipakai di: Monitoring Nominal Realisasi, Laporan Kinerja, Laporan Saya &
 * Laporan Kegiatan. Default mode ditentukan oleh halaman pemakainya
 * (lihat defaultPeriode di lib/laporan/periode.ts).
 */
import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { DatePicker } from '#/components/ui/date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  BULAN_OPTIONS,
  periodeForMode,
  shiftPeriode,
  TRIWULAN_OPTIONS,
  type Bulan,
  type PeriodeMode,
  type PeriodeValue,
} from '#/lib/laporan/periode'

const PERIODE_MODE_OPTIONS: { value: PeriodeMode; label: string }[] = [
  { value: 'BULANAN', label: 'Bulanan' },
  { value: 'TRIWULAN', label: 'Triwulan' },
  { value: 'TAHUNAN', label: 'Tahunan' },
  { value: 'SEMUA', label: 'Seluruh Periode' },
  { value: 'KUSTOM', label: 'Kustom' },
]

const STEP_BUTTON_CLASS =
  'flex size-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-bg-surface text-zinc-600 transition hover:border-brand-border-strong hover:text-brand-solid'

const SELECT_TRIGGER_CLASS =
  'min-h-10 w-fit shrink-0 rounded-xl border-brand-border bg-bg-surface px-4 text-sm font-semibold hover:border-brand-border-strong'

/** Distinct years (newest first) taken from each row's `tanggal` (YYYY-MM-DD…). */
export function tahunFromTanggal(rows: readonly { tanggal: string }[]): number[] {
  const years = new Set<number>()
  for (const row of rows) {
    const year = Number(row.tanggal.slice(0, 4))
    if (Number.isInteger(year) && year > 0) years.add(year)
  }
  return Array.from(years).sort((a, b) => b - a)
}

export function PeriodeSelector({
  value,
  tahunTersedia,
  onChange,
}: {
  value: PeriodeValue
  tahunTersedia: number[]
  onChange: (value: PeriodeValue) => void
}) {
  const tahunOptions = useMemo(() => {
    const years = new Set(tahunTersedia)
    if (value.tahun) years.add(value.tahun)
    return Array.from(years).sort((a, b) => b - a)
  }, [tahunTersedia, value.tahun])

  const unitLabel = value.mode === 'BULANAN' ? 'Bulan' : 'Triwulan'

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-4">
      <div className="flex items-center gap-2">
        <span className="hidden text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400 sm:inline">
          Periode
        </span>
        <div
          role="group"
          aria-label="Pilih mode periode"
          className="inline-flex flex-wrap rounded-[10px] border border-zinc-200/80 bg-zinc-50 p-0.5"
        >
          {PERIODE_MODE_OPTIONS.map(option => {
            const active = option.value === value.mode
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(periodeForMode(option.value, value, tahunOptions))}
                className={[
                  'whitespace-nowrap rounded-[7px] px-3 py-1 text-[13px] font-semibold transition',
                  active
                    ? 'bg-white text-brand-text shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-800',
                ].join(' ')}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      {value.mode !== 'SEMUA' && (
        <span className="hidden h-8 w-px shrink-0 bg-zinc-200 lg:block" aria-hidden="true" />
      )}

      {(value.mode === 'BULANAN' || value.mode === 'TRIWULAN') && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label={`${unitLabel} sebelumnya`}
            onClick={() => onChange(shiftPeriode(value, -1))}
            className={STEP_BUTTON_CLASS}
          >
            <ChevronLeft size={16} />
          </button>
          <Select
            value={value.tahun ? String(value.tahun) : ''}
            onValueChange={(next) => onChange(
              value.mode === 'BULANAN'
                ? { mode: 'BULANAN', tahun: Number(next), bulan: value.bulan ?? 1 }
                : { mode: 'TRIWULAN', tahun: Number(next), triwulan: value.triwulan ?? 1 },
            )}
          >
            <SelectTrigger className={`${SELECT_TRIGGER_CLASS} min-w-[88px]`}>
              <SelectValue placeholder={value.tahun ? String(value.tahun) : 'Tahun'} />
            </SelectTrigger>
            <SelectContent>
              {tahunOptions.map(year => (
                <SelectItem key={year} value={String(year)}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {value.mode === 'BULANAN' ? (
            <Select
              value={value.bulan ? String(value.bulan) : ''}
              onValueChange={(next) => onChange({
                mode: 'BULANAN',
                tahun: value.tahun ?? new Date().getFullYear(),
                bulan: Number(next) as Bulan,
              })}
            >
              <SelectTrigger className={`${SELECT_TRIGGER_CLASS} min-w-[140px]`}>
                <SelectValue placeholder="Bulan">
                  {selected => BULAN_OPTIONS.find(option => String(option.value) === selected)?.label ?? 'Bulan'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {BULAN_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select
              value={value.triwulan ? String(value.triwulan) : ''}
              onValueChange={(next) => onChange({
                mode: 'TRIWULAN',
                tahun: value.tahun ?? new Date().getFullYear(),
                triwulan: Number(next) as 1 | 2 | 3 | 4,
              })}
            >
              <SelectTrigger className={`${SELECT_TRIGGER_CLASS} min-w-[168px]`}>
                <SelectValue placeholder="Triwulan">
                  {selected => TRIWULAN_OPTIONS.find(option => String(option.value) === selected)?.label ?? 'Triwulan'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TRIWULAN_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <button
            type="button"
            aria-label={`${unitLabel} berikutnya`}
            onClick={() => onChange(shiftPeriode(value, 1))}
            className={STEP_BUTTON_CLASS}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {value.mode === 'TAHUNAN' && (
        <Select
          value={value.tahun ? String(value.tahun) : ''}
          onValueChange={(next) => onChange({ mode: 'TAHUNAN', tahun: Number(next) })}
        >
          <SelectTrigger className={`${SELECT_TRIGGER_CLASS} min-w-[104px]`}>
            <SelectValue placeholder={value.tahun ? String(value.tahun) : 'Tahun'} />
          </SelectTrigger>
          <SelectContent>
            {tahunOptions.map(year => (
              <SelectItem key={year} value={String(year)}>{year}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {value.mode === 'KUSTOM' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="space-y-1">
            <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">Mulai Dari Tanggal</span>
            <DatePicker
              value={value.dari ?? ''}
              onChange={(tanggal) => onChange({ mode: 'KUSTOM', dari: tanggal || undefined, sampai: value.sampai })}
              placeholder="Pilih tanggal mulai"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">Sampai Tanggal</span>
            <DatePicker
              value={value.sampai ?? ''}
              onChange={(tanggal) => onChange({ mode: 'KUSTOM', dari: value.dari, sampai: tanggal || undefined })}
              placeholder="Pilih tanggal selesai"
            />
          </label>
        </div>
      )}
    </div>
  )
}
