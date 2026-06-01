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
}

export function StepIndicator({ currentStep, onStepClick, completedSteps = [], labels }: StepIndicatorProps) {
  const steps = labels
    ? labels.map(label => ({ label }))
    : DEFAULT_STEPS
  return (
    <div className="w-full overflow-x-auto pb-1">
      <div className="flex min-w-max items-center justify-between gap-2 sm:min-w-0 sm:gap-0">
        {steps.map((step, i) => {
          const stepNum = i + 1
          const isActive = stepNum === currentStep
          const isCompleted = completedSteps.includes(stepNum) || stepNum < currentStep
          const isClickable = onStepClick && (isCompleted || isActive)

          return (
            <div key={step.label} className="relative flex min-w-16 flex-1 flex-col items-center">
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'absolute top-4 left-1/2 w-full h-0.5 z-0 transition-colors',
                    isCompleted ? 'bg-emerald-500' : 'bg-orange-100'
                  )}
                  style={{ width: 'calc(100% - 2rem)' }}
                />
              )}

              {/* Circle */}
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick?.(stepNum)}
                className={cn(
                  'relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                  'border-2',
                  isActive && 'border-orange-500 bg-orange-500 text-white shadow-sm shadow-orange-500/20 scale-110',
                  isCompleted && !isActive && 'border-emerald-500 bg-emerald-500 text-white',
                  !isActive && !isCompleted && 'border-orange-100 bg-white text-zinc-400 hover:border-orange-300',
                  isClickable && 'cursor-pointer',
                  !isClickable && 'cursor-default'
                )}
              >
                {isCompleted && !isActive ? (
                  <Check size={14} strokeWidth={3} />
                ) : (
                  stepNum
                )}
              </button>

              {/* Label */}
              <span
                className={cn(
                  'mt-2 text-[10px] font-medium text-center leading-tight',
                  isActive && 'text-orange-700 font-semibold',
                  isCompleted && !isActive && 'text-emerald-700',
                  !isActive && !isCompleted && 'text-zinc-400'
                )}
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
