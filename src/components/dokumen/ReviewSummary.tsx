/**
 * ReviewSummary — summary card shown in Step 5 before submit.
 */
import { FileText, Calendar, Users, Building2, CheckCircle2 } from 'lucide-react'
import { cn } from '#/lib/utils'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

function formatFileSizeFromUrl(url: string): string {
  // We can't get file size from URL alone, but we show the filename
  return url.split('/').pop() ?? 'File'
}

interface ReviewSummaryProps {
  fungsiNama: string
  kegiatanNama: string
  tahun: number
  tanggal: string
  isKetuaTim: boolean
  lampiranUrls: LampiranUrl[]
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

        <div className="flex items-start gap-2 p-3 bg-surface-container-low/30 rounded-lg col-span-2">
          <Users size={14} className="text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold mb-0.5">Peran</p>
            <p className="text-xs font-semibold text-on-surface">
              {isKetuaTim ? 'Ketua Tim' : 'Anggota'}
            </p>
          </div>
        </div>
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
