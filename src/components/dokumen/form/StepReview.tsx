import { AlertCircle, CheckCircle2, FileCheck2, ShieldCheck } from 'lucide-react'
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
      <div className="overflow-hidden rounded-xl border border-[#CDE9D7] bg-[#F1FBF5]">
        <div className="flex items-start gap-3 p-3.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <CheckCircle2 size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-headline text-base font-bold tracking-tight text-emerald-900">
                Siap diajukan
              </h3>
              <span className="rounded-md bg-white px-2 py-1 text-[9px] font-semibold text-emerald-700">
                Tahap {stepCount} dari {stepCount} - {isNonMaterial ? 'Non-Material' : 'Material'}
              </span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-emerald-800">
              Tinjau ringkasan dan konsekuensi pengajuan sebelum membuka konfirmasi akhir.
            </p>
          </div>
        </div>

        <div className="grid gap-px border-t border-[#CDE9D7] bg-[#CDE9D7] sm:grid-cols-2">
          <div className="flex items-start gap-2.5 bg-white/80 px-3.5 py-2.5">
            <FileCheck2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-[9px] font-semibold text-stone-400">Hasil Pengajuan</p>
              <p className="mt-0.5 text-[10px] font-semibold text-stone-800">
                {isNonMaterial ? 'Disimpan sebagai Tersimpan' : 'Masuk ke alur validasi dan persetujuan'}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5 bg-white/80 px-3.5 py-2.5">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-[9px] font-semibold text-stone-400">Konfirmasi Akhir</p>
              <p className="mt-0.5 text-[10px] font-semibold text-stone-800">
                Periksa kembali data dan lampiran sebelum diproses.
              </p>
            </div>
          </div>
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
