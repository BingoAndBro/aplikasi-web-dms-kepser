import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '#/components/ui/select'
import type { DetailRow } from './dokumen-form-types'

interface StepDetailPermintaanProps {
  grouped?: boolean
  kategoriPermintaanId: string
  kategoriPermintaanNama: string
  detailPermintaanId: string
  detailList: DetailRow[]
  canAdvanceFromStep5: boolean
  onDetailChange: (id: string) => void
  onBack: () => void
  onNext: () => void
}

export function StepDetailPermintaan({
  grouped = false,
  kategoriPermintaanNama,
  detailPermintaanId,
  detailList,
  canAdvanceFromStep5,
  onDetailChange,
  onBack,
  onNext,
}: StepDetailPermintaanProps) {
  return (
    <div className="space-y-3">
      {!grouped && (
        <h3 className="font-headline text-base font-bold text-on-surface">
          5. Pilih Detail Permintaan
        </h3>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <label className="text-[11px] font-bold text-zinc-700">
            Pilih Detail Permintaan <span className="text-warning-solid">*</span>
          </label>
          <span className="text-[10px] font-medium text-zinc-500">{kategoriPermintaanNama}</span>
        </div>
        <Select value={detailPermintaanId || null} onValueChange={v => onDetailChange(v ?? '')}>
          <SelectTrigger className="min-h-10 w-full rounded-xl border-brand-border bg-bg-surface px-4 text-sm hover:border-brand-border-strong">
            <SelectValue placeholder="-- Pilih Detail Permintaan --">
              {v => v ? (detailList.find(d => d.id === v)?.nama ?? '') : '-- Pilih Detail Permintaan --'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {detailList.map(d => (
              <SelectItem key={d.id} value={d.id} label={d.nama}>
                <div>
                  <p className="font-medium">{d.nama}</p>
                  {d.deskripsi && <p className="text-[10px] text-on-surface-variant">{d.deskripsi}</p>}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!grouped && (
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="gap-1.5 flex-1">
            <ChevronLeft size={14} />Kembali
          </Button>
          <Button onClick={onNext} disabled={!canAdvanceFromStep5} className="gap-1.5 flex-1">
            Lanjut <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  )
}
