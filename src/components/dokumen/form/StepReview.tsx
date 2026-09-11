import { AlertCircle } from 'lucide-react'
import { ReviewSummary } from '#/components/dokumen/ReviewSummary'
import type { LampiranUrl } from './dokumen-form-types'
import { StepperControls } from './StepperControls'

interface StepReviewProps {
  fungsiNama: string
  kegiatanNama: string
  tahun: number
  tanggal: string
  isKetuaTim: boolean
  lampiranUrls: LampiranUrl[]
  nominalRealisasi: string | null
  isNonMaterial: boolean
  komponenNama?: string
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
  fungsiNama,
  kegiatanNama,
  tahun,
  tanggal,
  isKetuaTim,
  lampiranUrls,
  nominalRealisasi,
  isNonMaterial,
  komponenNama,
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
      <ReviewSummary
        fungsiNama={fungsiNama}
        kegiatanNama={kegiatanNama}
        tahun={tahun}
        tanggal={tanggal}
        isKetuaTim={isKetuaTim}
        lampiranUrls={lampiranUrls}
        nominalRealisasi={nominalRealisasi}
        isNonMaterial={isNonMaterial}
        komponenNama={komponenNama}
        jenisPermintaanNama={jenisPermintaanNama}
        kategoriPermintaanNama={kategoriPermintaanNama}
        detailPermintaanNama={detailPermintaanNama}
        keteranganDetail={keteranganDetail}
      />

      {submitError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-semibold text-error">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          {submitError}
        </div>
      )}

      <StepperControls
        submitting={submitting}
        submitDisabled={submitDisabled}
        onBack={onBack}
        onSubmit={onSubmit}
        submitLabel={isNonMaterial ? 'Simpan Dokumen' : 'Ajukan Dokumen'}
      />
    </div>
  )
}
