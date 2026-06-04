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
    <div className="space-y-5">
      <div className="overflow-hidden rounded-3xl border border-emerald-200 bg-emerald-50">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">
                Tahap {stepCount} dari {stepCount}
              </p>
              <h3 className="mt-1 font-headline text-xl font-extrabold tracking-tight text-emerald-950">
                Siap diajukan
              </h3>
              <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-emerald-800">
                Tinjau ringkasan dan konsekuensi pengajuan sebelum melanjutkan ke konfirmasi akhir.
              </p>
            </div>
          </div>
          <span className="w-fit rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
            {isNonMaterial ? 'Non-Material' : 'Material'}
          </span>
        </div>

        <div className="grid gap-3 border-t border-emerald-200/80 bg-white/60 p-4 sm:grid-cols-2 sm:p-5">
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-white p-3.5">
            <FileCheck2 size={17} className="mt-0.5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">
                Hasil Pengajuan
              </p>
              <p className="mt-1 text-xs font-bold leading-relaxed text-zinc-950">
                {isNonMaterial ? 'Disimpan sebagai Tersimpan' : 'Masuk ke alur validasi dan persetujuan'}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-white p-3.5">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">
                Konfirmasi Akhir
              </p>
              <p className="mt-1 text-xs font-bold leading-relaxed text-zinc-950">
                Periksa kembali data dan lampiran sebelum diproses sistem.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-emerald-200/80 px-5 py-3">
          <p className="text-[10px] font-semibold leading-relaxed text-emerald-800">
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
