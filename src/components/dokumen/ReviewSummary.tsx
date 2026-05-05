/**
 * ReviewSummary — summary card shown in Step 5 before submit.
 */
import { FileText, Calendar, Users, Building2, CheckCircle2, Tag, Banknote, FileCheck } from 'lucide-react'
import { cn } from '#/lib/utils'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

function formatFileSizeFromUrl(url: string): string {
  return url.split('/').pop() ?? 'File'
}

interface ReviewSummaryProps {
  fungsiNama: string
  kegiatanNama: string
  tahun: number
  tanggal: string
  isKetuaTim: boolean
  lampiranUrls: LampiranUrl[]
  nominalRealisasi?: string | number | null
  isNonMaterial?: boolean
  jenisPermintaanNama?: string
  kategoriPermintaanNama?: string
  detailPermintaanNama?: string
  keteranganDetail?: string
}

function formatDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  } catch {
    return dateStr
  }
}

export function ReviewSummary({
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
}: ReviewSummaryProps) {
  return (
    <div className="space-y-4">
      <h3 className="font-headline text-base font-bold text-on-surface">Ringkasan Dokumen</h3>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-start gap-2 p-3 bg-surface-container-low/30 rounded-lg">
          <Building2 size={14} className="text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold mb-0.5">Fungsi</p>
            <p className="text-xs font-semibold text-on-surface">{fungsiNama}</p>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 bg-surface-container-low/30 rounded-lg">
          <FileText size={14} className="text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold mb-0.5">Kegiatan</p>
            <p className="text-xs font-semibold text-on-surface">{kegiatanNama}</p>
          </div>
        </div>

        {jenisPermintaanNama && (
          <div className="flex items-start gap-2 p-3 bg-surface-container-low/30 rounded-lg">
            <Tag size={14} className="text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold mb-0.5">
                {isNonMaterial ? 'Jenis Dokumen' : 'Jenis Permintaan'}
              </p>
              <p className="text-xs font-semibold text-on-surface">{jenisPermintaanNama}</p>
            </div>
          </div>
        )}

        {kategoriPermintaanNama && (
          <div className="flex items-start gap-2 p-3 bg-surface-container-low/30 rounded-lg">
            <Tag size={14} className="text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold mb-0.5">Kategori</p>
              <p className="text-xs font-semibold text-on-surface">{kategoriPermintaanNama}</p>
            </div>
          </div>
        )}

        {detailPermintaanNama && (
          <div className="flex items-start gap-2 p-3 bg-surface-container-low/30 rounded-lg">
            <Tag size={14} className="text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold mb-0.5">Detail</p>
              <p className="text-xs font-semibold text-on-surface">{detailPermintaanNama}</p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 p-3 bg-surface-container-low/30 rounded-lg">
          <Calendar size={14} className="text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold mb-0.5">Tahun</p>
            <p className="text-xs font-semibold text-on-surface">{tahun}</p>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 bg-surface-container-low/30 rounded-lg">
          <Calendar size={14} className="text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold mb-0.5">Tanggal</p>
            <p className="text-xs font-semibold text-on-surface">{formatDate(tanggal)}</p>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 bg-surface-container-low/30 rounded-lg">
          <Users size={14} className="text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold mb-0.5">Peran</p>
            <p className="text-xs font-semibold text-on-surface">
              {isKetuaTim ? 'Ketua Tim' : 'Anggota'}
            </p>
          </div>
        </div>

        {/* Nominal Realisasi (Material) / Keterangan Detail (Non-Material) */}
        {isNonMaterial ? (
          <div className="flex items-start gap-2 p-3 bg-blue-50/30 rounded-lg col-span-2">
            <FileCheck size={14} className="text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold mb-0.5">Keterangan Detail</p>
              <p className="text-xs font-semibold text-on-surface">
                {keteranganDetail || <span className="text-error">Belum diisi</span>}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 p-3 bg-surface-container-low/30 rounded-lg col-span-2">
            <Banknote size={14} className="text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold mb-0.5">Nominal Realisasi</p>
              <p className="text-xs font-semibold text-on-surface">
                {nominalRealisasi ? (
                  <span>Rp {nominalRealisasi}</span>
                ) : (
                  <span className="text-error">Belum diisi</span>
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Lampiran */}
      <div className="p-3 border border-border rounded-lg">
        <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold mb-3">
          Lampiran ({lampiranUrls.length})
        </p>
        {lampiranUrls.length === 0 ? (
          <p className="text-xs text-error">Belum ada lampiran diunggah.</p>
        ) : (
          <ul className="space-y-1.5">
            {lampiranUrls.map(l => (
              <li key={l.kelengkapan_id} className="flex items-center gap-2 text-xs">
                <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                <span className="text-on-surface font-medium">{l.nama}</span>
                <span className="text-outline truncate text-[10px] ml-auto">
                  {formatFileSizeFromUrl(l.url)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}