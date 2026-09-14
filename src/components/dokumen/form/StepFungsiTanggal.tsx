import { Check, ChevronRight, Loader2 } from 'lucide-react'
import { DatePicker } from '#/components/ui/date-picker'
import { Button } from '#/components/ui/button'
import type { FungsiRow } from './dokumen-form-types'

interface StepFungsiTanggalProps {
  grouped?: boolean
  showFungsi?: boolean
  showTanggal?: boolean
  fungsiId: string
  fungsiList: FungsiRow[]
  loadingFungsi: boolean
  tanggal: string
  tanggalError: string
  tahun: number
  canAdvanceFromStep1: boolean
  onFungsiChange: (id: string) => void
  onTanggalChange: (tanggal: string) => void
  onNext: () => void
}

const FUNGSI_BADGE_STYLES = [
  'bg-emerald-100 text-emerald-700',
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
]

export function StepFungsiTanggal({
  grouped = false,
  showFungsi = true,
  showTanggal = true,
  fungsiId,
  fungsiList,
  loadingFungsi,
  tanggal,
  tanggalError,
  tahun,
  canAdvanceFromStep1,
  onFungsiChange,
  onTanggalChange,
  onNext,
}: StepFungsiTanggalProps) {
  return (
    <div className="space-y-3">
      {!grouped && (
        <h3 className="font-headline text-base font-bold text-on-surface">
          1. Pilih Fungsi & Informasi Dasar
        </h3>
      )}

      {showFungsi && (
        <div className="space-y-2.5">
          <label className="text-[11px] font-bold text-zinc-700">
            Pilih Fungsi <span className="text-warning-solid">*</span>
          </label>
          {loadingFungsi ? (
            <div className="flex min-h-16 items-center justify-center gap-2 rounded-xl border border-brand-border bg-[#FFFAF6] text-xs text-zinc-500">
              <Loader2 size={14} className="animate-spin" />Memuat fungsi...
            </div>
          ) : fungsiList.length === 0 ? (
            <p className="rounded-xl border border-brand-border bg-[#FFFAF6] p-3 text-xs text-zinc-500">
              Tidak ada fungsi tersedia.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {fungsiList.map((fungsi, index) => {
                const selected = fungsiId === fungsi.id

                return (
                  <button
                    key={fungsi.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onFungsiChange(fungsi.id)}
                    className={`relative min-h-16 rounded-xl border p-3 pr-8 text-left transition ${
                      selected
                        ? 'border-[#F97316] bg-[#FFF7ED] ring-1 ring-[#FDBA74]'
                        : 'border-brand-border bg-[#FFFAF6] hover:border-brand-border-strong hover:bg-[#FFF4EA]'
                    }`}
                  >
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${
                      FUNGSI_BADGE_STYLES[index % FUNGSI_BADGE_STYLES.length]
                    }`}>
                      {fungsi.nama}
                    </span>
                    <span className="mt-2 block text-[10px] font-medium text-zinc-500">
                      {fungsi.jumlah_kegiatan !== undefined
                        ? `${fungsi.jumlah_kegiatan} kegiatan tersedia`
                        : 'Fungsi tersedia'}
                    </span>
                    {selected && (
                      <span className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-[#F97316] text-white">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {showTanggal && (
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-zinc-700">
            Pilih Tanggal Laporan <span className="text-warning-solid">*</span>
          </label>
          <DatePicker
            value={tanggal}
            onChange={onTanggalChange}
            placeholder="Pilih tanggal pelaksanaan"
            variant="prototype"
            placement="top"
            requiredLabel="Wajib Diisi"
          />
          {tanggalError ? (
            <p className="flex items-center gap-1 text-[10px] text-error">
              <span>!</span> {tanggalError}
            </p>
          ) : tahun ? (
            <p className="text-[10px] text-zinc-500">
              Tahun laporan: <span className="font-semibold text-zinc-700">{tahun}</span>
            </p>
          ) : null}
        </div>
      )}

      {!grouped && (
        <Button onClick={onNext} disabled={!canAdvanceFromStep1} className="w-full gap-1.5">
          Lanjut <ChevronRight size={14} />
        </Button>
      )}
    </div>
  )
}
