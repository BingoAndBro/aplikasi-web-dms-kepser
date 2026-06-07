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
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pilih tanggal...",
  className,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [month, setMonth] = React.useState(() =>
    value
      ? (() => { const [y, m, d] = value.split("-").map(Number); return new Date(y, m - 1, d) })()
      : new Date()
  )
  const ref = React.useRef<HTMLDivElement>(null)

  const selectedDate = value
    ? (() => { const [y, m, d] = value.split("-").map(Number); return new Date(y, m - 1, d) })()
    : undefined

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  function handleSelect(date: Date | undefined) {
    if (!date) return
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, "0")
    const dd = String(date.getDate()).padStart(2, "0")
    const iso = `${yyyy}-${mm}-${dd}`
    onChange?.(iso)
    setOpen(false)
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

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={cn(
          "w-full flex items-center gap-2 px-4 py-2.5",
          "bg-[#FFFAF6] border border-[#F0E1D5] rounded-xl",
          "text-sm font-semibold text-zinc-950",
          "outline-none transition-all hover:border-[#FFBC80]",
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
            <div className="min-w-[280px] rounded-2xl border border-[#F0E1D5] bg-[#FFFDF9] p-3 shadow-2xl shadow-zinc-950/10">
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
