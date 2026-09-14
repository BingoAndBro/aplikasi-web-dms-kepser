"use client"

import * as React from "react"
import { DayPicker } from "react-day-picker"
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react"

import { cn } from "#/lib/utils"

export interface DatePickerProps {
  value?: string
  onChange?: (date: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  variant?: "default" | "prototype"
  placement?: "bottom" | "top"
  requiredLabel?: string
}

type PickerView = "day" | "month" | "year"

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
const DAY_LABELS = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"]
const PROTOTYPE_CALENDAR_WIDTH = 266
const FLOATING_GAP = 12
const VIEWPORT_PADDING = 8

export function DatePicker({
  value,
  onChange,
  placeholder = "Pilih tanggal...",
  className,
  disabled,
  variant = "prototype",
  placement = "top",
  requiredLabel,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [month, setMonth] = React.useState(() =>
    value
      ? (() => { const [y, m, d] = value.split("-").map(Number); return new Date(y, m - 1, d) })()
      : new Date()
  )
  const [view, setView] = React.useState<PickerView>("day")
  const [floatingStyle, setFloatingStyle] = React.useState<React.CSSProperties>({})
  const ref = React.useRef<HTMLDivElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const popupRef = React.useRef<HTMLDivElement>(null)

  const selectedDate = value
    ? (() => { const [y, m, d] = value.split("-").map(Number); return new Date(y, m - 1, d) })()
    : undefined

  React.useEffect(() => {
    if (!selectedDate) return
    setMonth(selectedDate)
  }, [value])

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || popupRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const updateFloatingPosition = React.useCallback(() => {
    if (!ref.current || typeof window === "undefined") return

    const anchorRect = ref.current.getBoundingClientRect()
    const popupWidth = popupRef.current?.offsetWidth ?? PROTOTYPE_CALENDAR_WIDTH
    const popupHeight = popupRef.current?.offsetHeight ?? 320
    const spaceAbove = anchorRect.top - FLOATING_GAP - VIEWPORT_PADDING
    const spaceBelow = window.innerHeight - anchorRect.bottom - FLOATING_GAP - VIEWPORT_PADDING

    let renderAbove = placement === "top"
    if (renderAbove && spaceAbove < popupHeight && spaceBelow > spaceAbove) {
      renderAbove = false
    } else if (!renderAbove && spaceBelow < popupHeight && spaceAbove > spaceBelow) {
      renderAbove = true
    }

    const availableHeight = Math.max(
      180,
      renderAbove ? spaceAbove : spaceBelow
    )
    const maxHeight = Math.min(popupHeight, availableHeight)
    const left = Math.min(
      Math.max(VIEWPORT_PADDING, anchorRect.left),
      Math.max(VIEWPORT_PADDING, window.innerWidth - popupWidth - VIEWPORT_PADDING)
    )
    const top = renderAbove
      ? Math.max(VIEWPORT_PADDING, anchorRect.top - FLOATING_GAP - maxHeight)
      : Math.min(
          window.innerHeight - VIEWPORT_PADDING - maxHeight,
          anchorRect.bottom + FLOATING_GAP
        )

    setFloatingStyle({
      left,
      top,
      maxHeight,
      overflowY: availableHeight < popupHeight ? "auto" : undefined,
    })
  }, [placement])

  React.useEffect(() => {
    if (!open || variant !== "prototype") return

    updateFloatingPosition()
    const frame = window.requestAnimationFrame(updateFloatingPosition)
    window.addEventListener("resize", updateFloatingPosition)
    window.addEventListener("scroll", updateFloatingPosition, true)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", updateFloatingPosition)
      window.removeEventListener("scroll", updateFloatingPosition, true)
    }
  }, [open, variant, view, month, updateFloatingPosition])

  function handleSelect(date: Date | undefined) {
    if (!date) return
    onChange?.(toIsoDate(date))
    setOpen(false)
  }

  function handlePrototypeSelect(date: Date) {
    setMonth(date)
    onChange?.(toIsoDate(date))
    setOpen(false)
    setView("day")
  }

  function handleToday() {
    handlePrototypeSelect(new Date())
  }

  function formatDisplay(iso?: string) {
    if (!iso) return ""
    const [yyyy, mm, dd] = iso.split("-").map(Number)
    const d = new Date(yyyy, mm - 1, dd)
    return d.toLocaleDateString("id-ID", {
      weekday: "short",
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
  }

  if (variant === "prototype") {
    return (
      <div ref={ref} className={cn("relative", className)}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => !disabled && setOpen(o => !o)}
          disabled={disabled}
          className={cn(
            "group flex min-h-10 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left",
            "border-brand-border bg-bg-surface text-zinc-950 transition",
            "hover:border-brand-solid hover:bg-brand-surface",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-border-strong/70",
            "cursor-pointer",
            open && "border-brand-solid bg-brand-surface",
            disabled && "cursor-not-allowed bg-zinc-50 text-zinc-500 opacity-70"
          )}
        >
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-lg border transition",
              open
                ? "border-brand-solid bg-brand-solid text-white"
                : "border-brand-border bg-white text-brand-text-muted",
              "group-hover:border-brand-solid group-hover:bg-brand-solid group-hover:text-white"
            )}
          >
            <Calendar size={15} />
          </span>
          <span className="min-w-0 flex-1">
            {requiredLabel ? (
              <span
                className={cn(
                  "block text-[8px] font-black uppercase tracking-[0.1em] transition",
                  open ? "text-brand-solid" : "text-brand-text-muted"
                )}
              >
                {requiredLabel}
              </span>
            ) : null}
            <span className={cn(
              "block truncate text-[13px] font-semibold leading-tight text-zinc-950",
              requiredLabel && "mt-0.5"
            )}>
              {value ? formatDisplay(value) : placeholder}
            </span>
          </span>
          <ChevronRight
            size={16}
            className={cn(
              "shrink-0 text-brand-text-muted transition-transform duration-200",
              open && "-rotate-90"
            )}
          />
        </button>

        {open && (
          <>
            <div
              ref={popupRef}
              style={floatingStyle}
              className={cn(
                "fixed z-50 animate-in fade-in-0 zoom-in-95 duration-150"
              )}
            >
              <PrototypeCalendar
                month={month}
                selectedDate={selectedDate}
                view={view}
                onViewChange={setView}
                onMonthChange={setMonth}
                onSelect={handlePrototypeSelect}
                onToday={handleToday}
                onClose={() => setOpen(false)}
              />
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={cn(
          "w-full flex items-center gap-2 px-4 py-2.5",
          "bg-bg-surface border border-brand-border rounded-xl",
          "text-sm font-semibold text-zinc-950",
          "outline-none transition-all hover:border-brand-border-strong",
          "focus-visible:ring-2 focus-visible:ring-orange-200/70 focus-visible:border-orange-300",
          "cursor-pointer",
          disabled && "cursor-not-allowed bg-zinc-50 text-zinc-500 opacity-70",
          !value && "text-zinc-500"
        )}
      >
        <Calendar size={16} className="shrink-0" />
        <span className="flex-1 text-left">
          {value ? formatDisplay(value) : placeholder}
        </span>
        <ChevronRight
          size={14}
          className={cn(
            "shrink-0 text-outline transition-transform duration-200",
            open && "rotate-90"
          )}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute top-full left-0 z-50 mt-2 animate-in fade-in-0 zoom-in-95 duration-150">
            <div className="min-w-[280px] rounded-2xl border border-brand-border bg-bg-surface p-3 shadow-2xl shadow-zinc-950/10">
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={handleSelect}
                month={month}
                onMonthChange={setMonth}
                showOutsideDays
                className="w-full"
                classNames={{
                  root: "w-full font-sans",
                  months: "flex flex-col gap-2",
                  month: "space-y-3",
                  caption: "flex items-center justify-between px-1 pb-2",
                  caption_label: "text-sm font-bold text-on-surface",
                  nav: "flex items-center gap-0.5",
                  button_previous: "p-1.5 rounded-lg hover:bg-surface-container transition-colors cursor-pointer text-on-surface",
                  button_next: "p-1.5 rounded-lg hover:bg-surface-container transition-colors cursor-pointer text-on-surface",
                  month_grid: "w-full border-collapse",
                  weekdays: "table-header-group",
                  weekday: "text-[10px] font-black text-outline uppercase tracking-wider py-1 text-center",
                  week: "table-row",
                  day: "table-cell text-center py-0.5",
                  day_button: "w-8 h-8 text-xs font-medium rounded-lg transition-all cursor-pointer",
                  selected: "bg-primary text-white hover:bg-primary hover:text-white",
                  today: "font-bold text-primary",
                  outside: "text-outline/40",
                  disabled: "text-outline/30 cursor-not-allowed",
                  hidden: "invisible",
                }}
                components={{
                  Chevron: ({ className, orientation }) => (
                    orientation === "left"
                      ? <ChevronLeft size={16} className={className} />
                      : <ChevronRight size={16} className={className} />
                  ),
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function PrototypeCalendar({
  month,
  selectedDate,
  view,
  onViewChange,
  onMonthChange,
  onSelect,
  onToday,
  onClose,
}: {
  month: Date
  selectedDate?: Date
  view: PickerView
  onViewChange: (view: PickerView) => void
  onMonthChange: (date: Date) => void
  onSelect: (date: Date) => void
  onToday: () => void
  onClose: () => void
}) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const yearStart = year - 5

  return (
    <div className="w-[266px] overflow-hidden rounded-[14px] border border-brand-border bg-bg-surface shadow-xl shadow-zinc-950/8">
      <div className="grid h-9 grid-cols-3 bg-brand-surface p-1">
        <PickerTab active={view === "day"} onClick={() => onViewChange("day")}>Hari</PickerTab>
        <PickerTab active={view === "month"} onClick={() => onViewChange("month")}>Bulan</PickerTab>
        <PickerTab active={view === "year"} onClick={() => onViewChange("year")}>Tahun</PickerTab>
      </div>

      {view === "day" ? (
        <DayGrid
          month={month}
          selectedDate={selectedDate}
          onMonthChange={onMonthChange}
          onSelect={onSelect}
        />
      ) : view === "month" ? (
        <MonthGrid
          monthIndex={monthIndex}
          onSelect={(nextMonth) => {
            onMonthChange(createClampedDate(year, nextMonth, selectedDate?.getDate() ?? 1))
            onViewChange("day")
          }}
        />
      ) : (
        <YearGrid
          selectedYear={year}
          startYear={yearStart}
          onSelect={(nextYear) => {
            onMonthChange(createClampedDate(nextYear, monthIndex, selectedDate?.getDate() ?? 1))
            onViewChange("month")
          }}
        />
      )}

      <div className="flex items-center justify-between border-t border-bg-sunken bg-bg-surface px-3 py-2">
        <button
          type="button"
          onClick={onToday}
          className="rounded-lg px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-solid hover:bg-brand-surface"
        >
          Hari Ini
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-white px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-900 shadow-sm shadow-zinc-950/5 hover:bg-brand-surface"
        >
          Tutup
        </button>
      </div>
    </div>
  )
}

function PickerTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 rounded-md text-[9px] font-bold uppercase tracking-[0.12em] transition",
        active ? "bg-brand-solid text-white shadow-sm" : "text-brand-text-muted hover:bg-white/70 hover:text-zinc-900"
      )}
    >
      {children}
    </button>
  )
}

function DayGrid({
  month,
  selectedDate,
  onMonthChange,
  onSelect,
}: {
  month: Date
  selectedDate?: Date
  onMonthChange: (date: Date) => void
  onSelect: (date: Date) => void
}) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const cells = buildCalendarCells(year, monthIndex)

  return (
    <div className="px-3.5 pb-3 pt-3.5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-bold uppercase tracking-[0.03em] text-zinc-950">
          {month.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
            className="flex size-6 items-center justify-center rounded-lg text-text-muted hover:bg-brand-surface hover:text-zinc-950"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
            className="flex size-6 items-center justify-center rounded-lg text-text-muted hover:bg-brand-surface hover:text-zinc-950"
          >
            <ChevronRight size={14} />
          </button>
        </span>
      </div>

      <div className="grid grid-cols-7 gap-y-2.5">
        {DAY_LABELS.map(day => (
          <div key={day} className="text-center text-[8px] font-medium uppercase tracking-[0.08em] text-[#B8ADA7]">
            {day}
          </div>
        ))}
        {cells.map((cell, index) => {
          const isSelected = selectedDate ? isSameDate(cell.date, selectedDate) : false
          const isToday = isSameDate(cell.date, new Date())

          return (
            <button
              key={`${cell.date.toISOString()}-${index}`}
              type="button"
              onClick={() => onSelect(cell.date)}
              className={cn(
                "relative mx-auto flex size-6 items-center justify-center rounded-md text-[11px] font-medium leading-none transition",
                cell.currentMonth ? "text-zinc-950" : "text-brand-border",
                (isToday || isSelected) && "text-brand-solid",
                !isSelected && "hover:bg-brand-surface"
              )}
            >
              {cell.date.getDate()}
              {(isToday || isSelected) && (
                <span className="absolute bottom-0.5 left-1/2 size-0.5 -translate-x-1/2 rounded-full bg-brand-solid" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function MonthGrid({ monthIndex, onSelect }: { monthIndex: number; onSelect: (month: number) => void }) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-3 px-5 py-5">
      {MONTH_LABELS.map((label, index) => (
        <button
          key={label}
          type="button"
          onClick={() => onSelect(index)}
          className={cn(
            "h-9 rounded-xl text-xs font-medium transition",
            index === monthIndex ? "bg-brand-solid text-white shadow-sm" : "text-zinc-950 hover:bg-brand-surface"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function YearGrid({
  selectedYear,
  startYear,
  onSelect,
}: {
  selectedYear: number
  startYear: number
  onSelect: (year: number) => void
}) {
  const years = Array.from({ length: 12 }, (_, index) => startYear + index)

  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-3 px-5 py-5">
      {years.map(year => (
        <button
          key={year}
          type="button"
          onClick={() => onSelect(year)}
          className={cn(
            "h-9 rounded-xl text-xs font-medium transition",
            year === selectedYear ? "bg-brand-solid text-white shadow-sm" : "text-zinc-950 hover:bg-brand-surface"
          )}
        >
          {year}
        </button>
      ))}
    </div>
  )
}

function buildCalendarCells(year: number, monthIndex: number) {
  const firstDay = new Date(year, monthIndex, 1)
  const start = new Date(year, monthIndex, 1 - firstDay.getDay())
  const lastDay = new Date(year, monthIndex + 1, 0)
  const end = new Date(year, monthIndex + 1, lastDay.getDay() === 6 ? 0 : 6 - lastDay.getDay())
  const cellCount = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1

  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      date,
      currentMonth: date.getMonth() === monthIndex,
    }
  })
}

function toIsoDate(date: Date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function createClampedDate(year: number, monthIndex: number, day: number) {
  const maxDay = new Date(year, monthIndex + 1, 0).getDate()
  return new Date(year, monthIndex, Math.min(day, maxDay))
}

function isSameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}
