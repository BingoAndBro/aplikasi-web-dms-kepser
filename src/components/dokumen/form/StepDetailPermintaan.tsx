import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '#/components/ui/select'
import type { DetailRow } from './dokumen-form-types'

interface StepDetailPermintaanProps {
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
  kategoriPermintaanNama,
  detailPermintaanId,
  detailList,
  canAdvanceFromStep5,
  onDetailChange,
  onBack,
  onNext,
}: StepDetailPermintaanProps) {
  return (
    <div className="space-y-4">
      <h3 className="font-headline text-base font-bold text-on-surface">
        5. Pilih Detail Permintaan
      </h3>

      <p className="text-xs text-on-surface-variant">
        Untuk kategori <strong className="text-on-surface">{kategoriPermintaanNama}</strong>
      </p>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-on-surface">
          Detail <span className="text-error">*</span>
        </label>
        <Select value={detailPermintaanId} onValueChange={v => onDetailChange(v ?? '')}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Pilih detail...">
              {v => detailList.find(d => d.id === v)?.nama ?? ''}
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

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="gap-1.5 flex-1">
          <ChevronLeft size={14} />Kembali
        </Button>
        <Button onClick={onNext} disabled={!canAdvanceFromStep5} className="gap-1.5 flex-1">
          Lanjut <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  )
}
