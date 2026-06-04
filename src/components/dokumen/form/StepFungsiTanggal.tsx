import { ChevronRight, Loader2 } from 'lucide-react'
import { DatePicker } from '#/components/ui/date-picker'
import { Button } from '#/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '#/components/ui/select'
import type { FungsiRow } from './dokumen-form-types'

interface StepFungsiTanggalProps {
  grouped?: boolean
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

export function StepFungsiTanggal({
  grouped = false,
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
    <div className="space-y-4">
      {!grouped && (
        <h3 className="font-headline text-base font-bold text-on-surface">
          1. Pilih Fungsi & Informasi Dasar
        </h3>
      )}

      <div className="space-y-2">
        <label className="text-xs font-semibold text-zinc-700">
          Fungsi <span className="text-error">*</span>
        </label>
        {loadingFungsi ? (
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <Loader2 size={14} className="animate-spin" />Memuat...
          </div>
        ) : (
          <Select value={fungsiId} onValueChange={v => onFungsiChange(v ?? '')}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih fungsi...">
                {v => v ? (fungsiList.find(f => f.id === v)?.nama ?? '') : 'Pilih fungsi...'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {fungsiList.map(f => (
                <SelectItem key={f.id} value={f.id} label={f.nama}>
                  {f.nama}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-zinc-700">
          Tanggal <span className="text-error">*</span>
        </label>
        <DatePicker
          value={tanggal}
          onChange={onTanggalChange}
          placeholder="Pilih tanggal..."
        />
        {tanggalError ? (
          <p className="text-[10px] text-error flex items-center gap-1">
            <span>⚠</span> {tanggalError}
          </p>
        ) : tahun ? (
          <p className="text-[10px] text-on-surface-variant">
            Tahun: <span className="font-semibold text-primary">{tahun}</span>
          </p>
        ) : null}
      </div>

      {!grouped && (
        <Button onClick={onNext} disabled={!canAdvanceFromStep1} className="w-full gap-1.5">
          Lanjut <ChevronRight size={14} />
        </Button>
      )}
    </div>
  )
}
