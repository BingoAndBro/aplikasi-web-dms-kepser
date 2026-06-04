/**
 * StepIndicator — horizontal step progress bar for Ajukan Dokumen form.
 * Shows steps dynamically based on labels prop.
 */
import { Check } from 'lucide-react'
import { cn } from '#/lib/utils'

const DEFAULT_STEPS = [
  { label: 'Fungsi' },
  { label: 'Kegiatan' },
  { label: 'Peran' },
  { label: 'Unggah' },
  { label: 'Review' },
]

interface StepIndicatorProps {
  currentStep: number
  onStepClick?: (step: number) => void
  completedSteps?: number[]
  labels?: string[]
  subtitles?: string[]
}

export function StepIndicator({
  currentStep,
  onStepClick,
  completedSteps = [],
  labels,
  subtitles = [],
}: StepIndicatorProps) {
  const steps = labels
    ? labels.map(label => ({ label }))
    : DEFAULT_STEPS

  return (
    <div className="w-full">
      <div className="flex w-full items-center">
        {steps.map((step, i) => {
          const stepNum = i + 1
          const isActive = stepNum === currentStep
          const isCompleted = completedSteps.includes(stepNum) || stepNum < currentStep
          const isClickable = onStepClick && (isCompleted || isActive)

          return (
            <div key={step.label} className="flex min-w-0 flex-1 items-center last:flex-none">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick?.(stepNum)}
                className={cn(
                  'group flex min-w-0 shrink-0 items-center gap-3 text-left',
                  isClickable ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full border bg-white text-xs font-bold transition-colors',
                    isActive && 'border-[#F97316] bg-[#F97316] text-white shadow-sm shadow-orange-200',
                    isCompleted && !isActive && 'border-emerald-500 bg-emerald-500 text-white',
                    !isActive && !isCompleted && 'border-zinc-200 bg-zinc-100 text-zinc-400',
                  )}
                >
                  {isCompleted && !isActive ? (
                    <Check size={14} strokeWidth={3} />
                  ) : (
                    stepNum
                  )}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span
                    className={cn(
                      'block max-w-full text-[11px] font-semibold leading-tight',
                      isActive && 'text-zinc-950',
                      isCompleted && !isActive && 'text-emerald-700',
                      !isActive && !isCompleted && 'text-zinc-400',
                    )}
                  >
                    {step.label}
                  </span>
                  {subtitles[i] && (
                    <span className="mt-1 block max-w-full text-[9px] font-medium leading-tight text-zinc-400">
                      {subtitles[i]}
                    </span>
                  )}
                </span>
              </button>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'mx-4 h-0.5 min-w-6 flex-1 rounded-full transition-colors sm:mx-6',
                    isCompleted ? 'bg-emerald-500' : 'bg-zinc-200',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
