import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
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
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-brand-border bg-bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pb-0">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button
          variant="outline"
          size="lg"
          onClick={onBack}
          className="w-full gap-1.5 border-brand-border bg-white sm:w-auto"
          disabled={submitting}
        >
          <ChevronLeft size={14} />Kembali
        </Button>
        <Button
          size="lg"
          onClick={onSubmit}
          disabled={submitDisabled}
          className="w-full gap-1.5 bg-[#F97316] px-5 text-white hover:bg-brand-solid-hover sm:w-auto"
        >
          {submitting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Memproses...
            </>
          ) : (
            <>
              {submitLabel}
              <ChevronRight size={14} />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
