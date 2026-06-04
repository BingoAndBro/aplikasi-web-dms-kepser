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
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {steps.map((step, i) => {
          const stepNum = i + 1
          const isActive = stepNum === currentStep
          const isCompleted = completedSteps.includes(stepNum) || stepNum < currentStep
          const isClickable = onStepClick && (isCompleted || isActive)

          return (
            <div key={step.label} className="relative min-w-0">
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'absolute left-[calc(50%+1rem)] right-[calc(-50%+1rem)] top-4 z-0 h-0.5 rounded-full transition-colors',
                    isCompleted ? 'bg-emerald-400' : 'bg-orange-100',
                  )}
                />
              )}

              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick?.(stepNum)}
                className={cn(
                  'group relative z-10 flex w-full min-w-0 flex-col items-center text-center',
                  isClickable ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full border-2 bg-white text-xs font-black transition-all',
                    isActive && 'scale-110 border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/25',
                    isCompleted && !isActive && 'border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-500/20',
                    !isActive && !isCompleted && 'border-orange-100 text-zinc-400',
                  )}
                >
                  {isCompleted && !isActive ? (
                    <Check size={14} strokeWidth={3} />
                  ) : (
                    stepNum
                  )}
                </span>
                <span
                  className={cn(
                    'mt-2 block max-w-full text-[10px] font-black leading-tight sm:text-[11px]',
                    isActive && 'text-orange-800',
                    isCompleted && !isActive && 'text-emerald-700',
                    !isActive && !isCompleted && 'text-zinc-400',
                  )}
                >
                  {step.label}
                </span>
                {subtitles[i] && (
                  <span className="mt-1 hidden max-w-full text-[9px] font-medium leading-tight text-zinc-500 min-[360px]:block">
                    {subtitles[i]}
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
