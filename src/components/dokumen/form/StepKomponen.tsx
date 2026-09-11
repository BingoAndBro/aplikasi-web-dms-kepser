import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '#/components/ui/select'
import type { KomponenRow } from './dokumen-form-types'

interface StepKomponenProps {
  grouped?: boolean
  kegiatanNama: string
  komponenId: string
  komponenList: KomponenRow[]
  loadingKomponen: boolean
  canAdvanceFromKomponen: boolean
  onKomponenChange: (id: string) => void
  onBack: () => void
  onNext: () => void
}

export function StepKomponen({
  grouped = false,
  kegiatanNama,
  komponenId,
  komponenList,
  loadingKomponen,
  canAdvanceFromKomponen,
  onKomponenChange,
  onBack,
  onNext,
}: StepKomponenProps) {
  return (
    <div className="space-y-3">
      {!grouped && (
        <h3 className="font-headline text-base font-bold text-on-surface">
          Pilih Komponen
        </h3>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <label className="text-[11px] font-bold text-zinc-700">
            Pilih Komponen <span className="text-[#D97706]">*</span>
          </label>
          <span className="text-[10px] font-medium text-zinc-500">{kegiatanNama}</span>
        </div>
        {loadingKomponen ? (
          <div className="flex min-h-10 items-center gap-2 rounded-xl border border-[#F0E1D5] bg-[#FFFAF6] px-3 text-xs text-zinc-500">
            <Loader2 size={14} className="animate-spin" />Memuat...
          </div>
        ) : komponenList.length === 0 ? (
          <p className="rounded-xl border border-[#F0E1D5] bg-[#FFFAF6] p-3 text-xs text-zinc-500">
            Tidak ada komponen untuk kegiatan yang dipilih.
          </p>
        ) : (
          <Select value={komponenId || null} onValueChange={v => onKomponenChange(v ?? '')}>
            <SelectTrigger className="min-h-10 w-full rounded-xl border-[#F0E1D5] bg-[#FFFAF6] px-4 text-sm hover:border-[#FFBC80]">
              <SelectValue placeholder="-- Pilih Komponen --">
                {v => v ? (komponenList.find(k => k.id === v)?.nama ?? '') : '-- Pilih Komponen --'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {komponenList.map(k => (
                <SelectItem key={k.id} value={k.id} label={k.nama}>
                  <div>
                    <p className="font-medium">{k.nama}</p>
                    {k.deskripsi && <p className="text-[10px] text-on-surface-variant">{k.deskripsi}</p>}
                  </div>
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
          <Button onClick={onNext} disabled={!canAdvanceFromKomponen} className="gap-1.5 flex-1">
            Lanjut <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  )
}
