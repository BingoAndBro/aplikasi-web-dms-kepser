import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Medal, Trophy } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { KelengkapanChecklist } from '#/components/dokumen/KelengkapanChecklist'
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
  return (
    <div className="space-y-4">
      <h3 className="font-headline text-base font-bold text-on-surface">
        {grouped
          ? `Kelengkapan dan ${isNonMaterial ? 'Keterangan Detail' : 'Nominal Realisasi'}`
          : `${isNonMaterial ? '4' : (kategoriHasDetail ? '6' : '5')}. Unggah Lampiran${isNonMaterial ? '' : ' & Nominal'}`}
      </h3>

      <p className="text-xs text-on-surface-variant">
        Kelengkapan untuk <strong className="text-on-surface">{kegiatanNama}</strong>
        {isNonMaterial ? (
          <> - <strong className="text-on-surface">{jenisDokumenNama}</strong></>
        ) : (
          <> — <strong className="text-on-surface">{jenisPermintaanNama}</strong>{' / '}
          <strong className="text-on-surface">{kategoriPermintaanNama}</strong>
          {detailPermintaanNama && <> / <strong className="text-on-surface">{detailPermintaanNama}</strong></>}
        </>
        )}
        {' sebagai '}
        <strong className="text-on-surface">{isKetuaTim ? 'Ketua Tim' : 'Anggota'}</strong>
      </p>

      {/* Auto-detected badge */}
      {chairmanBadgeVisible && (
        <div className={`rounded-lg p-3 transition-all ${
          isKetuaTim
            ? 'bg-green-50 border border-green-200'
            : 'bg-orange-50 border border-orange-200'
        }`}>
          <div className="flex items-center gap-3">
            {isChairmanLoading ? (
              <Loader2 size={18} className="animate-spin text-primary" />
            ) : isKetuaTim ? (
              <Trophy size={18} className="text-green-600" />
            ) : (
              <Medal size={18} className="text-orange-600" />
            )}
            <div>
              <p className={`text-sm font-semibold ${
                isKetuaTim ? 'text-green-800' : 'text-orange-800'
              }`}>
                {isKetuaTim
                  ? 'Anda adalah Ketua Tim di kegiatan ini'
                  : 'Anda adalah Anggota di kegiatan ini'}
              </p>
              <p className={`text-xs mt-0.5 ${
                isKetuaTim ? 'text-green-600' : 'text-orange-700'
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
        <div className="flex items-center justify-center py-2">
          <Loader2 size={18} className="animate-spin text-outline" />
          <span className="ml-2 text-sm text-on-surface-variant">Memeriksa peran...</span>
        </div>
      )}

      <KelengkapanChecklist
        kegiatanId={kegiatanId}
        isKetuaTim={isKetuaTim}
        onComplete={onKelengkapanComplete}
        jenisPermintaanId={!isNonMaterial ? jenisPermintaanId || undefined : undefined}
        kategoriPermintaanId={!isNonMaterial ? kategoriPermintaanId || undefined : undefined}
        detailPermintaanId={!isNonMaterial ? detailPermintaanId || undefined : undefined}
        isNonMaterial={isNonMaterial}
      />

      {/* Nominal / Keterangan Section */}
      {isNonMaterial ? (
        // Non-Material: Keterangan Detail
        <div className="space-y-1.5 rounded-xl border border-orange-100 bg-[#FFF8F1] p-3">
          <label className="text-xs font-medium text-on-surface">
            Keterangan Detail Dokumen <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={keteranganDetail}
            onChange={(e) => onKeteranganDetailChange(e.target.value)}
            placeholder={`Contoh: ${jenisDokumenNama || 'Judul kegiatan'}...`}
            className="w-full px-3 py-2 border border-outline rounded-lg text-sm bg-surface text-on-surface
              focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
              placeholder:text-outline"
          />
          <p className="text-[10px] text-on-surface-variant">
            Jelaskan detail dokumen, contoh: "{jenisDokumenNama || 'Rapat'} Bersama Pimpinan"
          </p>
        </div>
      ) : (
        // Material: Nominal Realisasi
        <div className="space-y-1.5 rounded-xl border border-orange-100 bg-[#FFF8F1] p-3">
          <label className="text-xs font-medium text-on-surface">
            Nominal Realisasi (Rp) <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={nominalRealisasi}
            onChange={(e) => onNominalRealisasiChange(e.target.value)}
            placeholder="Contoh: 1.500.000"
            className="w-full px-3 py-2 border border-outline rounded-lg text-sm bg-surface text-on-surface
              focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
              placeholder:text-outline"
          />
          {nominalError && (
            <p className="text-[10px] text-error flex items-center gap-1">
              <AlertCircle size={12} /> {nominalError}
            </p>
          )}
          <p className="text-[10px] text-on-surface-variant">
            Masukkan nominal dalam rupiah.
          </p>
        </div>
      )}

      {!grouped && (
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="gap-1.5 flex-1">
            <ChevronLeft size={14} />Kembali
          </Button>
          <Button
            onClick={onNext}
            disabled={!canAdvanceFromStep6()}
            className="gap-1.5 flex-1"
          >
            Lanjut <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  )
}
