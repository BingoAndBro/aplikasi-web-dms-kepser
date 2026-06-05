import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Crown,
  Loader2,
  Users,
} from 'lucide-react'

import { KelengkapanChecklist } from '#/components/dokumen/KelengkapanChecklist'
import { Button } from '#/components/ui/button'
import type { LampiranUrl } from './dokumen-form-types'

interface StepUploadLampiranProps {
  grouped?: boolean
  isNonMaterial: boolean
  kategoriHasDetail: boolean
  kegiatanId: string
  fungsiNama: string
  kegiatanNama: string
  jenisDokumenNama: string
  jenisPermintaanId: string
  jenisPermintaanNama: string
  kategoriPermintaanId: string
  kategoriPermintaanNama: string
  detailPermintaanId: string
  detailPermintaanNama: string
  isKetuaTim: boolean
  isChairmanLoading: boolean
  chairmanBadgeVisible: boolean
  lampiranUrls: LampiranUrl[]
  keteranganDetail: string
  nominalRealisasi: string
  nominalError: string
  canAdvanceFromStep6: () => boolean
  onKelengkapanComplete: (lampirans: LampiranUrl[], missing: any[]) => void
  onAttachmentDirtyChange?: (dirty: boolean) => void
  onKeteranganDetailChange: (value: string) => void
  onNominalRealisasiChange: (value: string) => void
  onBack: () => void
  onNext: () => void
}

export function StepUploadLampiran({
  grouped = false,
  isNonMaterial,
  kategoriHasDetail,
  kegiatanId,
  fungsiNama,
  kegiatanNama,
  jenisDokumenNama,
  jenisPermintaanId,
  jenisPermintaanNama,
  kategoriPermintaanId,
  kategoriPermintaanNama,
  detailPermintaanId,
  detailPermintaanNama,
  isKetuaTim,
  isChairmanLoading,
  chairmanBadgeVisible,
  lampiranUrls,
  keteranganDetail,
  nominalRealisasi,
  nominalError,
  canAdvanceFromStep6,
  onKelengkapanComplete,
  onAttachmentDirtyChange,
  onKeteranganDetailChange,
  onNominalRealisasiChange,
  onBack,
  onNext,
}: StepUploadLampiranProps) {
  const contextParts = [
    fungsiNama,
    kegiatanNama,
    isNonMaterial ? jenisDokumenNama : jenisPermintaanNama,
    !isNonMaterial ? kategoriPermintaanNama : '',
    !isNonMaterial ? detailPermintaanNama : '',
  ].filter(Boolean)

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-xl border border-[#F0E1D5] bg-[#FFFAF6] px-3 py-2.5">
        {contextParts.map((part, index) => (
          <div key={`${part}-${index}`} className="flex min-w-0 items-center gap-1.5">
            {index > 0 && <ChevronRight size={12} className="shrink-0 text-stone-300" />}
            <span className={index === 0
              ? 'max-w-full truncate rounded-md bg-[#EEF7F1] px-2 py-1 text-[10px] font-semibold text-emerald-700'
              : 'max-w-full truncate rounded-md bg-[#FFF3D6] px-2 py-1 text-[10px] font-semibold text-[#B45309]'
            }>
              {part}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-[#F6C768] bg-[#FFFDF9] p-3.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FFF3D6] text-[#D97706]">
          {isChairmanLoading || !chairmanBadgeVisible
            ? <Loader2 size={16} className="animate-spin" />
            : isKetuaTim
              ? <Crown size={18} />
              : <Users size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-stone-900">
            {isChairmanLoading || !chairmanBadgeVisible
              ? 'Memeriksa peran pada kegiatan...'
              : `Status kegiatan Anda: ${isKetuaTim ? 'Ketua Tim' : 'Anggota'}`}
            </p>
            {!isChairmanLoading && chairmanBadgeVisible && (
              <span className="rounded-full border border-[#F6C768] bg-[#FFF8E8] px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-[#B45309]">
                {isKetuaTim ? 'Ketua Tim' : 'Anggota'}
              </span>
            )}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-stone-500">
            Sistem menentukan status ini otomatis berdasarkan assignment kegiatan.
          </p>
        </div>
      </div>

      <KelengkapanChecklist
        kegiatanId={kegiatanId}
        isKetuaTim={isKetuaTim}
        initialLampirans={lampiranUrls}
        onComplete={onKelengkapanComplete}
        onDirtyChange={onAttachmentDirtyChange}
        jenisPermintaanId={!isNonMaterial ? jenisPermintaanId || undefined : undefined}
        kategoriPermintaanId={!isNonMaterial ? kategoriPermintaanId || undefined : undefined}
        detailPermintaanId={!isNonMaterial ? detailPermintaanId || undefined : undefined}
        isNonMaterial={isNonMaterial}
      />

      <div className="space-y-2 border-t border-[#F0E1D5] pt-4">
        <label className="text-[11px] font-semibold text-stone-700">
          {isNonMaterial ? 'Keterangan Detail Dokumen' : 'Nominal Realisasi'}
          {' '}
          <span className="text-[#D97706]">*</span>
        </label>
        {isNonMaterial ? (
          <>
            <textarea
              value={keteranganDetail}
              onChange={(e) => onKeteranganDetailChange(e.target.value)}
              placeholder="Masukkan keterangan detail dokumen..."
              rows={5}
              className="min-h-32 w-full resize-none rounded-2xl border border-[#F0E1D5] bg-[#FFFAF6] px-4 py-3.5 text-sm leading-relaxed text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-[#F97316] focus:ring-2 focus:ring-[#FFEDD5]"
            />
            <p className="text-[10px] leading-relaxed text-stone-500">
              Jelaskan konteks singkat dokumen Non-Material.
            </p>
          </>
        ) : (
          <>
            <div className="flex min-h-10 items-center rounded-xl border border-[#F0E1D5] bg-[#FFFAF6] px-3.5 focus-within:border-[#F97316] focus-within:ring-2 focus-within:ring-[#FFEDD5]">
              <span className="mr-2 text-xs font-medium text-stone-400">Rp</span>
              <input
                type="text"
                value={nominalRealisasi}
                onChange={(e) => onNominalRealisasiChange(e.target.value)}
                placeholder="Masukkan nominal realisasi"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm font-semibold text-stone-950 outline-none placeholder:font-normal placeholder:text-stone-400"
              />
            </div>
            {nominalError && (
              <p className="flex items-center gap-1 text-[10px] font-semibold text-error">
                <AlertCircle size={12} /> {nominalError}
              </p>
            )}
          </>
        )}
      </div>

      {!grouped && (
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1 gap-1.5">
            <ChevronLeft size={14} />Kembali
          </Button>
          <Button
            onClick={onNext}
            disabled={!canAdvanceFromStep6()}
            className="flex-1 gap-1.5"
          >
            Lanjut <ChevronRight size={14} />
          </Button>
        </div>
      )}

      {!grouped && (
        <p className="sr-only">
          Langkah {isNonMaterial ? '4' : (kategoriHasDetail ? '6' : '5')} unggah lampiran.
        </p>
      )}
    </div>
  )
}
