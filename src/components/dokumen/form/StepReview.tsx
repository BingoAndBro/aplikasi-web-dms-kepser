import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { ReviewSummary } from '#/components/dokumen/ReviewSummary'
import type { LampiranUrl } from './dokumen-form-types'
import { StepperControls } from './StepperControls'

interface StepReviewProps {
  stepCount: number
  fungsiNama: string
  kegiatanNama: string
  tahun: number
  tanggal: string
  isKetuaTim: boolean
  lampiranUrls: LampiranUrl[]
  nominalRealisasi: string | null
  isNonMaterial: boolean
  jenisPermintaanNama: string
  kategoriPermintaanNama?: string
  detailPermintaanNama?: string
  keteranganDetail?: string
  submitError: string
  submitting: boolean
  submitDisabled: boolean
  onBack: () => void
  onSubmit: () => void
}

export function StepReview({
  stepCount,
  fungsiNama,
  kegiatanNama,
  tahun,
  tanggal,
  isKetuaTim,
  lampiranUrls,
  nominalRealisasi,
  isNonMaterial,
  jenisPermintaanNama,
  kategoriPermintaanNama,
  detailPermintaanNama,
  keteranganDetail,
  submitError,
  submitting,
  submitDisabled,
  onBack,
  onSubmit,
}: StepReviewProps) {
  return (
    <div className="space-y-4">
      <h3 className="font-headline text-base font-bold text-on-surface">
        {stepCount}. Review dan Pengajuan
      </h3>

      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white">
          <CheckCircle2 size={20} />
        </div>
        <div>
          <p className="font-headline text-sm font-bold text-emerald-950">Siap diajukan</p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-800">
            {isNonMaterial
              ? 'Dokumen Non-Material akan disimpan sebagai Tersimpan tanpa nominal realisasi.'
              : 'Dokumen Material akan mengikuti alur validasi dan persetujuan yang berlaku.'}
          </p>
        </div>
      </div>

      <ReviewSummary
        fungsiNama={fungsiNama}
        kegiatanNama={kegiatanNama}
        tahun={tahun}
        tanggal={tanggal}
        isKetuaTim={isKetuaTim}
        lampiranUrls={lampiranUrls}
        nominalRealisasi={nominalRealisasi}
        isNonMaterial={isNonMaterial}
        jenisPermintaanNama={jenisPermintaanNama}
        kategoriPermintaanNama={kategoriPermintaanNama}
        detailPermintaanNama={detailPermintaanNama}
        keteranganDetail={keteranganDetail}
      />

      {submitError && (
        <div className="flex items-start gap-2 text-error text-xs p-3 bg-error/10 rounded-lg">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          {submitError}
        </div>
      )}

      <StepperControls
        submitting={submitting}
        submitDisabled={submitDisabled}
        onBack={onBack}
        onSubmit={onSubmit}
      />
    </div>
  )
}
