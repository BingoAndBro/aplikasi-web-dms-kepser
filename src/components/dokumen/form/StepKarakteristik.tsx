import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '#/components/ui/button'

interface StepKarakteristikProps {
  grouped?: boolean
  isNonMaterial: boolean
  canAdvance: boolean
  onSelectCharacteristic: (isNonMaterial: boolean) => void
  onBack: () => void
  onNext: () => void
}

export function StepKarakteristik({
  grouped = false,
  isNonMaterial,
  canAdvance,
  onSelectCharacteristic,
  onBack,
  onNext,
}: StepKarakteristikProps) {
  return (
    <div className="space-y-2.5">
      {!grouped && (
        <h3 className="font-headline text-base font-bold text-on-surface">
          Pilih Karakteristik Dokumen
        </h3>
      )}

      <label className="text-[11px] font-bold text-zinc-700">
        Karakteristik Dokumen <span className="text-warning-solid">*</span>
      </label>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <button
          type="button"
          aria-pressed={!isNonMaterial}
          onClick={() => onSelectCharacteristic(false)}
          className={`relative rounded-xl border p-3 text-left transition ${
            !isNonMaterial
              ? 'border-brand-solid bg-bg-surface ring-1 ring-brand-border-strong'
              : 'border-brand-border bg-bg-surface hover:border-brand-border-strong hover:bg-bg-surface'
          }`}
        >
          <span className="text-[11px] font-bold text-zinc-950">Material</span>
          <span className="mt-1 block text-[10px] font-medium leading-relaxed text-zinc-500">
            Memiliki nominal realisasi dan mengikuti proses validasi serta persetujuan.
          </span>
          {!isNonMaterial && (
            <span className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-brand-solid text-white">
              <Check size={12} strokeWidth={3} />
            </span>
          )}
        </button>

        <button
          type="button"
          aria-pressed={isNonMaterial}
          onClick={() => onSelectCharacteristic(true)}
          className={`relative rounded-xl border p-3 text-left transition ${
            isNonMaterial
              ? 'border-brand-solid bg-bg-surface ring-1 ring-brand-border-strong'
              : 'border-brand-border bg-bg-surface hover:border-brand-border-strong hover:bg-bg-surface'
          }`}
        >
          <span className="text-[11px] font-bold text-zinc-950">Non-Material</span>
          <span className="mt-1 block text-[10px] font-medium leading-relaxed text-zinc-500">
            Tanpa nominal realisasi dan disimpan sebagai Tersimpan.
          </span>
          {isNonMaterial && (
            <span className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-brand-solid text-white">
              <Check size={12} strokeWidth={3} />
            </span>
          )}
        </button>
      </div>

      {!grouped && (
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1 gap-1.5">
            <ChevronLeft size={14} />Kembali
          </Button>
          <Button onClick={onNext} disabled={!canAdvance} className="flex-1 gap-1.5">
            Lanjut <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  )
}
