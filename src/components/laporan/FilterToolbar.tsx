import type { ReactNode } from 'react'
import { Filter, Search } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'

export type ToolbarOption = { id: string; nama: string }

/**
 * Toolbar filter bersama untuk halaman daftar (Monitoring Dokumen Tim,
 * Laporan Kegiatan, Monitoring Realisasi, Laporan Kinerja, Activity Log).
 *
 *   baris 1: [pencarian ..................] [Filter Lanjutan]
 *   baris 2: LABEL [field ▾]   LABEL [field ▾]  (filter utama + urutan)
 *   panel  : isi Filter Lanjutan (hanya bila `advanced` diisi dan dibuka)
 *   footer : jumlah hasil + aksi (mis. ekspor ZIP)
 *
 * Filter yang sering dipakai (pembuat, status, role) diletakkan di `fields`
 * supaya langsung terlihat; `advanced` untuk filter yang jarang dipakai.
 */
export function FilterToolbar({
  search,
  advanced,
  fields,
  resultLabel,
  actions,
}: {
  search: {
    value: string
    onChange: (value: string) => void
    placeholder: string
    label: string
  }
  advanced?: {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Jumlah filter aktif DI DALAM panel (bukan field di baris 2). */
    activeCount: number
    onReset: () => void
    children: ReactNode
  }
  fields?: ReactNode
  resultLabel: ReactNode
  actions?: ReactNode
}) {
  const advancedHighlighted = Boolean(advanced && (advanced.open || advanced.activeCount > 0))

  return (
    <div className="overflow-hidden rounded-[26px] border border-zinc-200/80 bg-bg-surface shadow-[0_3px_14px_rgba(15,23,42,0.07)]">
      <div className="space-y-3 border-b border-zinc-100 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{search.label}</span>
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <input
              type="search"
              placeholder={search.placeholder}
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              className="h-11 w-full rounded-[20px] border border-zinc-200 bg-bg-surface pl-11 pr-4 text-sm font-medium text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-brand-border-strong focus:ring-4 focus:ring-brand-border/60"
            />
          </label>
          {advanced && (
            <Button
              type="button"
              variant={advancedHighlighted ? 'outline' : 'ghost'}
              aria-expanded={advanced.open}
              className={[
                'h-11 shrink-0 rounded-[22px] border px-4 text-sm font-extrabold shadow-sm',
                advancedHighlighted
                  ? 'border-brand-border-strong bg-brand-surface text-brand-text hover:bg-brand-surface'
                  : 'border-zinc-200 bg-bg-surface text-zinc-950 hover:bg-brand-surface',
              ].join(' ')}
              onClick={() => advanced.onOpenChange(!advanced.open)}
            >
              <Filter size={16} />
              Filter Lanjutan
              {advanced.activeCount > 0 && (
                <span className="ml-1 rounded-full bg-brand-text px-1.5 py-0.5 text-[10px] leading-none text-white">
                  {advanced.activeCount}
                </span>
              )}
            </Button>
          )}
        </div>
        {fields && (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
            {fields}
          </div>
        )}
      </div>

      {advanced?.open && (
        <div className="border-b border-zinc-100 bg-bg-surface p-4 sm:p-5">
          <div className="rounded-[22px] border border-zinc-200/80 bg-brand-surface/35 p-4 shadow-none">
            {advanced.children}
          </div>
          <div className="mt-5 flex flex-col gap-2 border-t border-zinc-100 pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" className="font-bold" onClick={advanced.onReset}>
              Reset
            </Button>
            <Button type="button" className="font-bold shadow-sm" onClick={() => advanced.onOpenChange(false)}>
              Tutup
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm font-bold text-zinc-950">{resultLabel}</span>
        {actions}
      </div>
    </div>
  )
}

/**
 * Dropdown berlabel untuk baris 2 toolbar. Label di kiri, trigger mengisi
 * sisa lebar; tinggi mengikuti bawaan SelectTrigger (h-10).
 *
 * Jangan menaruh ikon langsung di dalam SelectTrigger: trigger adalah grid
 * 2 kolom (nilai + chevron), elemen ketiga akan membuat teks turun baris.
 */
export function ToolbarSelectField({
  label,
  srLabel,
  value,
  options,
  onChange,
  highlightWhenSet = false,
}: {
  label: string
  srLabel?: string
  value: string
  options: ToolbarOption[]
  onChange: (value: string) => void
  /** Warnai field bila nilainya bukan opsi pertama (opsi "Semua ..."). */
  highlightWhenSet?: boolean
}) {
  const selectedLabel = options.find(option => option.id === value)?.nama ?? options[0]?.nama ?? ''
  const isHighlighted = highlightWhenSet && value !== options[0]?.id

  return (
    <label className="flex min-w-0 items-center gap-2.5">
      <span className="shrink-0 text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">
        {label}
        {srLabel ? <span className="sr-only"> {srLabel}</span> : null}
      </span>
      <Select value={value} onValueChange={(selected) => onChange(selected ?? options[0]?.id ?? '')}>
        <SelectTrigger
          className={[
            'w-full min-w-0 sm:w-[230px]',
            isHighlighted
              ? 'border-brand-border-strong bg-brand-surface text-brand-text'
              : 'hover:border-brand-border-strong',
          ].join(' ')}
        >
          <SelectValue placeholder={options[0]?.nama}>
            {() => <span className="truncate">{selectedLabel}</span>}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem key={option.id} value={option.id}>{option.nama}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

const ALL_OPTION_ID = '_all'

/** Field filter opsional: opsi pertama "Semua ..." memetakan ke `undefined`. */
export function ToolbarFilterField({
  label,
  srLabel,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string
  srLabel?: string
  allLabel: string
  value?: string
  options: ToolbarOption[]
  onChange: (value: string | undefined) => void
}) {
  return (
    <ToolbarSelectField
      label={label}
      srLabel={srLabel}
      value={value || ALL_OPTION_ID}
      options={[{ id: ALL_OPTION_ID, nama: allLabel }, ...options]}
      onChange={(selected) => onChange(selected === ALL_OPTION_ID ? undefined : selected)}
      highlightWhenSet
    />
  )
}

/** Filter "Pembuat Dokumen" -- paling sering dipakai, jadi selalu di baris 2. */
export function PembuatFilterSelect({
  value,
  options,
  onChange,
}: {
  value?: string
  options: ToolbarOption[]
  onChange: (value: string | undefined) => void
}) {
  return (
    <ToolbarFilterField
      label="Pembuat"
      srLabel="Dokumen"
      allLabel="Semua Pembuat"
      value={value}
      options={options}
      onChange={onChange}
    />
  )
}

/** Opsi unik (id, nama) dari daftar baris, diurutkan A-Z -- untuk dropdown pembuat/pengguna. */
export function buildPersonOptions<T>(
  rows: T[],
  getId: (row: T) => string | null | undefined,
  getNama: (row: T) => string,
): ToolbarOption[] {
  const options = new Map<string, string>()
  for (const row of rows) {
    const id = getId(row)
    if (!id) continue
    options.set(id, getNama(row))
  }
  return Array.from(options, ([id, nama]) => ({ id, nama }))
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id-ID'))
}
