import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '#/components/ui/select'
import type { KategoriRow } from './dokumen-form-types'

interface StepKategoriPermintaanProps {
  jenisPermintaanId: string
  jenisPermintaanNama: string
  kategoriPermintaanId: string
  kategoriList: KategoriRow[]
  loadingKategori: boolean
  canAdvanceFromStep4: boolean
  onKategoriChange: (id: string) => void
  onBack: () => void
  onNext: () => void
}

export function StepKategoriPermintaan({
  jenisPermintaanNama,
  kategoriPermintaanId,
  kategoriList,
  loadingKategori,
  canAdvanceFromStep4,
  onKategoriChange,
  onBack,
  onNext,
}: StepKategoriPermintaanProps) {
  return (
    <div className="space-y-4">
      <h3 className="font-headline text-base font-bold text-on-surface">
        4. Pilih Kategori Permintaan
      </h3>

      <p className="text-xs text-on-surface-variant">
        Untuk <strong className="text-on-surface">{jenisPermintaanNama}</strong>
      </p>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-on-surface">
          Kategori <span className="text-error">*</span>
        </label>
        {loadingKategori ? (
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <Loader2 size={14} className="animate-spin" />Memuat...
          </div>
        ) : kategoriList.length === 0 ? (
          <p className="text-xs text-on-surface-variant p-3 bg-muted rounded-lg">
            Tidak ada kategori untuk jenis yang dipilih.
          </p>
        ) : (
          <Select value={kategoriPermintaanId} onValueChange={v => onKategoriChange(v ?? '')}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih kategori...">
                {v => kategoriList.find(k => k.id === v)?.nama ?? ''}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {kategoriList.map(k => (
                <SelectItem key={k.id} value={k.id} label={k.nama}>
                  <div>
                    <p className="font-medium">{k.nama}</p>
                    {k.deskripsi && <p className="text-[10px] text-on-surface-variant">{k.deskripsi}</p>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="gap-1.5 flex-1">
          <ChevronLeft size={14} />Kembali
        </Button>
        <Button onClick={onNext} disabled={!canAdvanceFromStep4} className="gap-1.5 flex-1">
          Lanjut <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  )
}
