import { ChevronLeft, Loader2, Send } from 'lucide-react'
import { Button } from '#/components/ui/button'

interface StepperControlsProps {
  submitting: boolean
  submitDisabled: boolean
  onBack: () => void
  onSubmit: () => void
  submitLabel?: string
}

export function StepperControls({
  submitting,
  submitDisabled,
  onBack,
  onSubmit,
  submitLabel = 'Ajukan Dokumen',
}: StepperControlsProps) {
  return (
    <div className="sticky bottom-3 z-10 rounded-2xl border border-orange-100 bg-white/95 p-3 shadow-xl shadow-orange-950/5 backdrop-blur sm:static sm:border-orange-100 sm:bg-[#FFF9F3] sm:p-4 sm:shadow-none">
      <div className="mb-3 hidden items-center justify-between gap-4 sm:flex">
        <div>
          <p className="text-xs font-black text-zinc-950">Konfirmasi diperlukan</p>
          <p className="mt-0.5 text-[10px] font-medium text-zinc-500">
            Tombol utama akan membuka ringkasan konsekuensi sebelum diproses.
          </p>
        </div>
        <Send size={18} className="shrink-0 text-orange-600" />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          size="lg"
          onClick={onBack}
          className="w-full gap-1.5 border-orange-200 bg-white sm:w-auto"
          disabled={submitting}
        >
          <ChevronLeft size={14} />Kembali
        </Button>
        <Button
          size="lg"
          onClick={onSubmit}
          disabled={submitDisabled}
          className="w-full gap-1.5 bg-orange-600 px-5 text-white shadow-md shadow-orange-600/20 hover:bg-orange-700 sm:w-auto"
        >
          {submitting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Memproses...
            </>
          ) : (
            <>
              {submitLabel}
              <Send size={14} />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
