import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
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
    <div className="space-y-4">
      {!grouped && (
        <h3 className="font-headline text-base font-bold text-on-surface">
          {`3. ${isNonMaterial ? 'Pilih Jenis Dokumen' : 'Pilih Jenis Permintaan'}`}
        </h3>
      )}

      {/* Non-Material Toggle */}
      <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50/70 p-3">
        <input
          type="checkbox"
          id="isNonMaterial"
          checked={isNonMaterial}
          onChange={(e) => onToggleNonMaterial(e.target.checked)}
          className="w-4 h-4 rounded border-orange-400 text-primary focus:ring-primary"
        />
        <label htmlFor="isNonMaterial" className="text-sm text-orange-950 cursor-pointer flex-1">
          <span className="font-semibold">Dokumen Non-Material</span>
          <span className="block text-xs text-orange-800/80">
            Centang jika dokumen tidak memerlukan nominal dan disimpan sebagai Tersimpan.
          </span>
        </label>
      </div>

      {isNonMaterial ? (
        // Non-Material: Jenis Dokumen dropdown
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">
            Jenis Dokumen <span className="text-error">*</span>
          </label>
          {jenisDokumenList.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <Loader2 size={14} className="animate-spin" />Memuat jenis dokumen...
            </div>
          ) : (
            <Select value={jenisDokumenId} onValueChange={v => onJenisDokumenChange(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih jenis dokumen...">
                  {v => jenisDokumenList.find(j => j.id === v)?.nama ?? ''}
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
        // Material: Jenis Permintaan dropdown
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">
            Jenis Permintaan <span className="text-error">*</span>
          </label>
          {loadingJenis ? (
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <Loader2 size={14} className="animate-spin" />Memuat...
            </div>
          ) : jenisList.length === 0 ? (
            <p className="text-xs text-on-surface-variant p-3 bg-muted rounded-lg">
              Tidak ada jenis permintaan tersedia.
            </p>
          ) : (
            <Select value={jenisPermintaanId} onValueChange={v => onJenisChange(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih jenis permintaan...">
                  {v => jenisList.find(j => j.id === v)?.nama ?? ''}
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
          <Button variant="outline" onClick={onBack} className="gap-1.5 flex-1">
            <ChevronLeft size={14} />Kembali
          </Button>
          <Button onClick={onNext} disabled={!canAdvanceFromStep3} className="gap-1.5 flex-1">
            Lanjut <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  )
}
