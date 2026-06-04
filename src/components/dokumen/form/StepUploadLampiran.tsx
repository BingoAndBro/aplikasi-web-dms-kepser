import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  Loader2,
  Medal,
  ReceiptText,
  Trophy,
  UploadCloud,
} from 'lucide-react'

import { KelengkapanChecklist } from '#/components/dokumen/KelengkapanChecklist'
import { Button } from '#/components/ui/button'
import type { LampiranUrl } from './dokumen-form-types'

interface StepUploadLampiranProps {
  grouped?: boolean
  isNonMaterial: boolean
  kategoriHasDetail: boolean
  kegiatanId: string
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
  keteranganDetail: string
  nominalRealisasi: string
  nominalError: string
  canAdvanceFromStep6: () => boolean
  onKelengkapanComplete: (lampirans: LampiranUrl[], missing: any[]) => void
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
  keteranganDetail,
  nominalRealisasi,
  nominalError,
  canAdvanceFromStep6,
  onKelengkapanComplete,
  onKeteranganDetailChange,
  onNominalRealisasiChange,
  onBack,
  onNext,
}: StepUploadLampiranProps) {
  const characteristicLabel = isNonMaterial
    ? jenisDokumenNama
    : [jenisPermintaanNama, kategoriPermintaanNama, detailPermintaanNama]
      .filter(Boolean)
      .join(' / ')

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-orange-600">
            Kelengkapan Dokumen
          </p>
          <h3 className="mt-1 font-headline text-lg font-bold tracking-tight text-zinc-950">
            Unggah lampiran dan lengkapi detail
          </h3>
          <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-zinc-600">
            Lampiran yang dibutuhkan mengikuti kegiatan, karakteristik dokumen, dan peran yang terdeteksi.
          </p>
        </div>
        <span className="w-fit rounded-full bg-orange-50 px-3 py-1 text-[10px] font-semibold text-orange-700">
          {isNonMaterial ? 'Non-Material' : 'Material'}
        </span>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-zinc-200/70 bg-[#FFFAF5] p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <FileCheck2 size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-zinc-500">
                Konteks Kelengkapan
              </p>
              <p className="mt-1 break-words text-xs font-black leading-relaxed text-zinc-950">
                {kegiatanNama}
              </p>
              <p className="mt-1 break-words text-[10px] font-medium leading-relaxed text-zinc-600">
                {characteristicLabel}
              </p>
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-zinc-200/70 bg-[#FFFAF5] p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              {isKetuaTim ? <Trophy size={18} /> : <Medal size={18} />}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-zinc-500">
                Peran pada Kegiatan
              </p>
              <p className="mt-1 text-xs font-black text-zinc-950">
                {isKetuaTim ? 'Ketua Tim' : 'Anggota'}
              </p>
              <p className="mt-1 text-[10px] font-medium leading-relaxed text-zinc-600">
                {isKetuaTim ? 'Dokumen masuk ke Laporan Kegiatan.' : 'Dokumen masuk ke Laporan Saya.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {chairmanBadgeVisible && (
        <div className={`rounded-2xl border p-4 transition-all ${
          isKetuaTim
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-zinc-200 bg-white'
        }`}>
          <div className="flex items-center gap-3">
            {isChairmanLoading ? (
              <Loader2 size={18} className="animate-spin text-primary" />
            ) : isKetuaTim ? (
              <Trophy size={18} className="text-emerald-600" />
            ) : (
              <Medal size={18} className="text-orange-500" />
            )}
            <div>
              <p className={`text-sm font-semibold ${
                isKetuaTim ? 'text-emerald-800' : 'text-zinc-800'
              }`}>
                {isKetuaTim
                  ? 'Anda adalah Ketua Tim di kegiatan ini'
                  : 'Anda adalah Anggota di kegiatan ini'}
              </p>
              <p className={`mt-0.5 text-xs ${
                isKetuaTim ? 'text-emerald-700' : 'text-zinc-600'
              }`}>
                {isKetuaTim
                  ? 'Dokumen akan masuk ke Laporan Kegiatan.'
                  : 'Dokumen akan masuk ke Laporan Saya.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {!chairmanBadgeVisible && (
        <div className="flex items-center justify-center rounded-2xl border border-zinc-200/70 bg-[#FFFAF5] py-4">
          <Loader2 size={18} className="animate-spin text-outline" />
          <span className="ml-2 text-sm text-on-surface-variant">Memeriksa peran...</span>
        </div>
      )}

      <section className="rounded-2xl border border-zinc-200/70 bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-3 border-b border-zinc-100 pb-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <UploadCloud size={18} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-zinc-950">Lampiran Dokumen</h4>
            <p className="text-[10px] font-medium leading-relaxed text-zinc-500">
              Unggah seluruh lampiran wajib dan dokumen tambahan yang diperlukan.
            </p>
          </div>
        </div>

        <KelengkapanChecklist
          kegiatanId={kegiatanId}
          isKetuaTim={isKetuaTim}
          onComplete={onKelengkapanComplete}
          jenisPermintaanId={!isNonMaterial ? jenisPermintaanId || undefined : undefined}
          kategoriPermintaanId={!isNonMaterial ? kategoriPermintaanId || undefined : undefined}
          detailPermintaanId={!isNonMaterial ? detailPermintaanId || undefined : undefined}
          isNonMaterial={isNonMaterial}
        />
      </section>

      {isNonMaterial ? (
        <section className="rounded-2xl border border-zinc-200/70 bg-[#FFFAF5] p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <ReceiptText size={18} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-zinc-950">Keterangan Detail</h4>
              <p className="text-[10px] font-medium text-zinc-500">Berikan konteks singkat untuk dokumen Non-Material.</p>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-700">
              Keterangan Detail Dokumen <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={keteranganDetail}
              onChange={(e) => onKeteranganDetailChange(e.target.value)}
              placeholder={`Contoh: ${jenisDokumenNama || 'Judul kegiatan'}...`}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
            <p className="text-[10px] font-medium leading-relaxed text-zinc-500">
              Jelaskan detail dokumen, contoh: "{jenisDokumenNama || 'Rapat'} Bersama Pimpinan"
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-zinc-200/70 bg-[#FFFAF5] p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <ReceiptText size={18} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-zinc-950">Nominal Realisasi</h4>
              <p className="text-[10px] font-medium text-zinc-500">Masukkan nilai realisasi dokumen Material.</p>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-700">
              Nominal Realisasi (Rp) <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={nominalRealisasi}
              onChange={(e) => onNominalRealisasiChange(e.target.value)}
              placeholder="Contoh: 1.500.000"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm font-bold text-zinc-950 outline-none transition placeholder:font-normal placeholder:text-zinc-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
            {nominalError && (
              <p className="flex items-center gap-1 text-[10px] font-semibold text-error">
                <AlertCircle size={12} /> {nominalError}
              </p>
            )}
            <p className="text-[10px] font-medium text-zinc-500">Masukkan nominal dalam rupiah.</p>
          </div>
        </section>
      )}

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
