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
        <label className="text-[11px] font-bold text-zinc-700">
          Pilih Kegiatan <span className="text-orange-500">*</span>
        </label>
        {loadingKegiatan ? (
          <div className="flex min-h-11 items-center gap-2 rounded-xl border border-[#F1E5DA] bg-[#FFFCF9] px-3 text-xs text-zinc-500">
            <Loader2 size={14} className="animate-spin" />Memuat...
          </div>
        ) : kegiatanList.length === 0 ? (
          <p className="rounded-xl border border-[#F1E5DA] bg-[#FFFCF9] p-3 text-xs text-zinc-500">
            Tidak ada kegiatan untuk fungsi yang dipilih.
          </p>
        ) : (
          <Select value={kegiatanId} onValueChange={v => onKegiatanChange(v ?? '')}>
            <SelectTrigger className="min-h-11 w-full rounded-xl border-[#F1E5DA] bg-[#FFFCF9] px-4 text-sm hover:border-orange-200">
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
