import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'

interface StepNamaDokumenProps {
  grouped?: boolean
  namaDokumen: string
  canAdvanceFromStep3: boolean
  onNamaDokumenChange: (value: string) => void
  onBack: () => void
  onNext: () => void
}

export function StepNamaDokumen({
  grouped = false,
  namaDokumen,
  canAdvanceFromStep3,
  onNamaDokumenChange,
  onBack,
  onNext,
}: StepNamaDokumenProps) {
  return (
    <div className="space-y-3">
      {!grouped && (
        <h3 className="font-headline text-base font-bold text-on-surface">
          Nama Dokumen
        </h3>
      )}

      <div className="space-y-2">
        <label htmlFor="nama-dokumen-non-material" className="text-[11px] font-bold text-zinc-700">
          Nama Dokumen <span className="text-[#D97706]">*</span>
        </label>
        <Input
          id="nama-dokumen-non-material"
          value={namaDokumen}
          onChange={e => onNamaDokumenChange(e.target.value)}
          placeholder="Contoh: Laporan Kegiatan Bulanan"
          maxLength={255}
          className="min-h-10 w-full rounded-xl border-[#F0E1D5] bg-[#FFFAF6] px-4 text-sm hover:border-[#FFBC80]"
        />
      </div>

      {!grouped && (
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1 gap-1.5">
            <ChevronLeft size={14} />Kembali
          </Button>
          <Button onClick={onNext} disabled={!canAdvanceFromStep3} className="flex-1 gap-1.5">
            Lanjut <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  )
}
