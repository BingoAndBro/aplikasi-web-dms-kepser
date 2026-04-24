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
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, i) => {
          const stepNum = i + 1
          const isActive = stepNum === currentStep
          const isCompleted = completedSteps.includes(stepNum) || stepNum < currentStep
          const isClickable = onStepClick && (isCompleted || isActive)

          return (
            <div key={step.label} className="flex flex-col items-center relative flex-1">
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'absolute top-4 left-1/2 w-full h-0.5 z-0 transition-colors',
                    isCompleted ? 'bg-primary' : 'bg-outline-variant'
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
                  isActive && 'border-primary bg-primary text-primary-foreground shadow-sm scale-110',
                  isCompleted && !isActive && 'border-primary bg-primary text-primary-foreground',
                  !isActive && !isCompleted && 'border-outline-variant bg-background text-outline hover:border-primary/50',
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
                  isActive && 'text-primary font-semibold',
                  isCompleted && !isActive && 'text-primary',
                  !isActive && !isCompleted && 'text-outline'
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
