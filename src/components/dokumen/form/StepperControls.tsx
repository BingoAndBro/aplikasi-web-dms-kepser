import { ChevronLeft, Loader2 } from 'lucide-react'
import { Button } from '#/components/ui/button'

interface StepperControlsProps {
  submitting: boolean
  submitDisabled: boolean
  onBack: () => void
  onSubmit: () => void
}

export function StepperControls({
  submitting,
  submitDisabled,
  onBack,
  onSubmit,
}: StepperControlsProps) {
  return (
    <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-2xl border border-orange-100 bg-white/95 p-3 shadow-lg backdrop-blur sm:static sm:flex-row sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
      <Button variant="outline" onClick={onBack} className="w-full gap-1.5 sm:flex-1" disabled={submitting}>
        <ChevronLeft size={14} />Kembali
      </Button>
      <Button
        onClick={onSubmit}
        disabled={submitDisabled}
        className="w-full gap-1.5 sm:flex-1"
      >
        {submitting ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Mengajukan...
          </>
        ) : (
          'Ajukan Dokumen'
        )}
      </Button>
    </div>
  )
}
