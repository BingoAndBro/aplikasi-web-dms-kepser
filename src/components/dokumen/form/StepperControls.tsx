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
    <div className="flex gap-3">
      <Button variant="outline" onClick={onBack} className="gap-1.5 flex-1" disabled={submitting}>
        <ChevronLeft size={14} />Kembali
      </Button>
      <Button
        onClick={onSubmit}
        disabled={submitDisabled}
        className="gap-1.5 flex-1"
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
