import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '#/components/ui/select'
import type { KegiatanRow } from './dokumen-form-types'

interface StepKegiatanProps {
  grouped?: boolean
  fungsiId: string
  kegiatanId: string
  kegiatanList: KegiatanRow[]
  loadingKegiatan: boolean
  canAdvanceFromStep2: boolean
  onKegiatanChange: (id: string) => void
  onBack: () => void
  onNext: () => void
}

export function StepKegiatan({
  grouped = false,
  kegiatanId,
  kegiatanList,
  loadingKegiatan,
  canAdvanceFromStep2,
  onKegiatanChange,
  onBack,
  onNext,
}: StepKegiatanProps) {
  return (
    <div className="space-y-4">
      {!grouped && (
        <h3 className="font-headline text-base font-bold text-on-surface">
          2. Pilih Kegiatan
        </h3>
      )}

      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">
          Kegiatan <span className="text-error">*</span>
        </label>
        {loadingKegiatan ? (
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <Loader2 size={14} className="animate-spin" />Memuat...
          </div>
        ) : kegiatanList.length === 0 ? (
          <p className="text-xs text-on-surface-variant p-3 bg-muted rounded-lg">
            Tidak ada kegiatan untuk fungsi yang dipilih.
          </p>
        ) : (
          <Select value={kegiatanId} onValueChange={v => onKegiatanChange(v ?? '')}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih kegiatan...">
                {v => kegiatanList.find(k => k.id === v)?.nama ?? ''}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {kegiatanList.map(k => (
                <SelectItem key={k.id} value={k.id} label={k.nama}>
                  {k.nama}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!grouped && (
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="gap-1.5 flex-1">
            <ChevronLeft size={14} />Kembali
          </Button>
          <Button onClick={onNext} disabled={!canAdvanceFromStep2} className="gap-1.5 flex-1">
            Lanjut <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  )
}
