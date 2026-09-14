import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '#/components/ui/select'
import type { JenisRow } from './dokumen-form-types'

interface StepJenisPermintaanProps {
  grouped?: boolean
  kegiatanId: string
  jenisPermintaanId: string
  jenisList: JenisRow[]
  loadingJenis: boolean
  canAdvanceFromStep3: boolean
  onJenisChange: (id: string) => void
  onBack: () => void
  onNext: () => void
}

export function StepJenisPermintaan({
  grouped = false,
  jenisPermintaanId,
  jenisList,
  loadingJenis,
  canAdvanceFromStep3,
  onJenisChange,
  onBack,
  onNext,
}: StepJenisPermintaanProps) {
  return (
    <div className="space-y-3">
      {!grouped && (
        <h3 className="font-headline text-base font-bold text-on-surface">
          Pilih Jenis Permintaan
        </h3>
      )}

      <div className="space-y-2">
        <label className="text-[11px] font-bold text-zinc-700">
          Pilih Jenis Permintaan <span className="text-warning-solid">*</span>
        </label>
        {loadingJenis ? (
          <div className="flex min-h-10 items-center gap-2 rounded-xl border border-brand-border bg-bg-surface px-3 text-xs text-zinc-500">
            <Loader2 size={14} className="animate-spin" />Memuat...
          </div>
        ) : jenisList.length === 0 ? (
          <p className="rounded-xl border border-brand-border bg-bg-surface p-3 text-xs text-zinc-500">
            Tidak ada jenis permintaan tersedia.
          </p>
        ) : (
          <Select value={jenisPermintaanId || null} onValueChange={v => onJenisChange(v ?? '')}>
            <SelectTrigger className="min-h-10 w-full rounded-xl border-brand-border bg-bg-surface px-4 text-sm hover:border-brand-border-strong">
              <SelectValue placeholder="-- Pilih Jenis Permintaan --">
                {v => v ? (jenisList.find(j => j.id === v)?.nama ?? '') : '-- Pilih Jenis Permintaan --'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {jenisList.map(j => (
                <SelectItem key={j.id} value={j.id} label={j.nama}>
                  <div>
                    <p className="font-medium">{j.nama}</p>
                    {j.deskripsi && <p className="text-[10px] text-on-surface-variant">{j.deskripsi}</p>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!grouped && (
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1 gap-1.5">
            <ChevronLeft size={14} />Kembali
          </Button>
          <Button onClick={onNext} disabled={!canAdvanceFromStep3} className="flex-1 gap-1.5">
            Lanjut <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  )
}
