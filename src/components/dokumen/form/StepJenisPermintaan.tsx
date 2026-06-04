import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '#/components/ui/select'
import type { JenisDokumenRow, JenisRow } from './dokumen-form-types'

interface StepJenisPermintaanProps {
  grouped?: boolean
  kegiatanId: string
  isNonMaterial: boolean
  jenisPermintaanId: string
  jenisList: JenisRow[]
  loadingJenis: boolean
  jenisDokumenId: string
  jenisDokumenList: JenisDokumenRow[]
  canAdvanceFromStep3: boolean
  onToggleNonMaterial: (checked: boolean) => void
  onJenisChange: (id: string) => void
  onJenisDokumenChange: (id: string) => void
  onBack: () => void
  onNext: () => void
}

export function StepJenisPermintaan({
  grouped = false,
  isNonMaterial,
  jenisPermintaanId,
  jenisList,
  loadingJenis,
  jenisDokumenId,
  jenisDokumenList,
  canAdvanceFromStep3,
  onToggleNonMaterial,
  onJenisChange,
  onJenisDokumenChange,
  onBack,
  onNext,
}: StepJenisPermintaanProps) {
  return (
    <div className="space-y-3">
      {!grouped && (
        <h3 className="font-headline text-base font-bold text-on-surface">
          {`3. ${isNonMaterial ? 'Pilih Jenis Dokumen' : 'Pilih Jenis Permintaan'}`}
        </h3>
      )}

      <div className="space-y-2.5">
        <label className="text-[11px] font-bold text-zinc-700">
          Karakteristik Dokumen <span className="text-[#D97706]">*</span>
        </label>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            aria-pressed={!isNonMaterial}
            onClick={() => {
              if (isNonMaterial) onToggleNonMaterial(false)
            }}
            className={`relative rounded-xl border p-3 text-left transition ${
              !isNonMaterial
                ? 'border-[#F97316] bg-[#FFF7ED] ring-1 ring-[#FDBA74]'
                : 'border-[#F0E1D5] bg-[#FFFAF6] hover:border-[#FFBC80] hover:bg-[#FFF4EA]'
            }`}
          >
            <span className="text-[11px] font-bold text-zinc-950">Material</span>
            <span className="mt-1 block text-[10px] font-medium leading-relaxed text-zinc-500">
              Memiliki nominal realisasi dan mengikuti proses validasi serta persetujuan.
            </span>
            {!isNonMaterial && (
              <span className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-[#F97316] text-white">
                <Check size={12} strokeWidth={3} />
              </span>
            )}
          </button>

          <button
            type="button"
            aria-pressed={isNonMaterial}
            onClick={() => {
              if (!isNonMaterial) onToggleNonMaterial(true)
            }}
            className={`relative rounded-xl border p-3 text-left transition ${
              isNonMaterial
                ? 'border-[#F97316] bg-[#FFF7ED] ring-1 ring-[#FDBA74]'
                : 'border-[#F0E1D5] bg-[#FFFAF6] hover:border-[#FFBC80] hover:bg-[#FFF4EA]'
            }`}
          >
            <span className="text-[11px] font-bold text-zinc-950">Non-Material</span>
            <span className="mt-1 block text-[10px] font-medium leading-relaxed text-zinc-500">
              Tanpa nominal realisasi dan disimpan sebagai Tersimpan.
            </span>
            {isNonMaterial && (
              <span className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-[#F97316] text-white">
                <Check size={12} strokeWidth={3} />
              </span>
            )}
          </button>
        </div>
      </div>

      {isNonMaterial ? (
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-zinc-700">
            Pilih Jenis Dokumen <span className="text-[#D97706]">*</span>
          </label>
          {jenisDokumenList.length === 0 ? (
            <div className="flex min-h-10 items-center gap-2 rounded-xl border border-[#F0E1D5] bg-[#FFFAF6] px-3 text-xs text-zinc-500">
              <Loader2 size={14} className="animate-spin" />Memuat jenis dokumen...
            </div>
          ) : (
            <Select value={jenisDokumenId || null} onValueChange={v => onJenisDokumenChange(v ?? '')}>
              <SelectTrigger className="min-h-10 w-full rounded-xl border-[#F0E1D5] bg-[#FFFAF6] px-4 text-sm hover:border-[#FFBC80]">
                <SelectValue placeholder="-- Pilih Jenis Dokumen --">
                  {v => v ? (jenisDokumenList.find(j => j.id === v)?.nama ?? '') : '-- Pilih Jenis Dokumen --'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {jenisDokumenList.map(j => (
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
      ) : (
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-zinc-700">
            Pilih Jenis Permintaan <span className="text-[#D97706]">*</span>
          </label>
          {loadingJenis ? (
            <div className="flex min-h-10 items-center gap-2 rounded-xl border border-[#F0E1D5] bg-[#FFFAF6] px-3 text-xs text-zinc-500">
              <Loader2 size={14} className="animate-spin" />Memuat...
            </div>
          ) : jenisList.length === 0 ? (
            <p className="rounded-xl border border-[#F0E1D5] bg-[#FFFAF6] p-3 text-xs text-zinc-500">
              Tidak ada jenis permintaan tersedia.
            </p>
          ) : (
            <Select value={jenisPermintaanId || null} onValueChange={v => onJenisChange(v ?? '')}>
              <SelectTrigger className="min-h-10 w-full rounded-xl border-[#F0E1D5] bg-[#FFFAF6] px-4 text-sm hover:border-[#FFBC80]">
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
      )}

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
