import type { ReactNode } from 'react'
import {
  Banknote,
  Building2,
  Calendar,
  CheckCircle2,
  FileCheck2,
  FileText,
  Tags,
  Users,
} from 'lucide-react'

import type { LampiranUrl } from '#/lib/dokumen-helpers'
import { formatDate } from '#/lib/utils/format'

function formatFileNameFromUrl(url: string): string {
  return url.split('/').pop() ?? 'File'
}

type SummaryItemProps = {
  icon: ReactNode
  label: string
  value: ReactNode
  className?: string
}

function SummaryItem({ icon, label, value, className = '' }: SummaryItemProps) {
  return (
    <div className={`min-w-0 rounded-xl border border-zinc-200/70 bg-white p-3.5 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-zinc-500">
            {label}
          </p>
          <div className="mt-1 break-words text-xs font-bold leading-relaxed text-zinc-950">
            {value}
          </div>
        </div>
      </div>
    </div>
  )
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
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-orange-600">
            Ringkasan Pengajuan
          </p>
          <h3 className="mt-1 font-headline text-lg font-bold tracking-tight text-zinc-950">
            Periksa data sebelum konfirmasi
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600">
            Pastikan konteks, karakteristik, dan lampiran dokumen sudah sesuai.
          </p>
        </div>
        <span className="w-fit rounded-full bg-orange-50 px-3 py-1 text-[10px] font-semibold text-orange-700">
          Dokumen {isNonMaterial ? 'Non-Material' : 'Material'}
        </span>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-2xl border border-zinc-200/70 bg-[#FFFAF5] p-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <Building2 size={18} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-zinc-950">Konteks Dokumen</h4>
              <p className="text-[10px] font-medium text-zinc-500">Fungsi, kegiatan, tanggal, dan peran</p>
            </div>
          </div>

          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <SummaryItem icon={<Building2 size={14} />} label="Fungsi" value={fungsiNama} />
            <SummaryItem icon={<FileText size={14} />} label="Kegiatan" value={kegiatanNama} />
            <SummaryItem icon={<Calendar size={14} />} label="Tanggal" value={formatDate(tanggal)} />
            <SummaryItem icon={<Calendar size={14} />} label="Tahun" value={tahun} />
            <SummaryItem
              icon={<Users size={14} />}
              label="Peran"
              value={isKetuaTim ? 'Ketua Tim' : 'Anggota'}
              className="sm:col-span-2"
            />
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-zinc-200/70 bg-[#FFFAF5] p-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <Tags size={18} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-zinc-950">Karakteristik Dokumen</h4>
              <p className="text-[10px] font-medium text-zinc-500">
                {isNonMaterial ? 'Jenis dan keterangan dokumen' : 'Jenis, kategori, detail, dan nominal'}
              </p>
            </div>
          </div>

          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            {jenisPermintaanNama && (
              <SummaryItem
                icon={<Tags size={14} />}
                label={isNonMaterial ? 'Jenis Dokumen' : 'Jenis Permintaan'}
                value={jenisPermintaanNama}
                className={isNonMaterial ? 'sm:col-span-2' : ''}
              />
            )}
            {kategoriPermintaanNama && (
              <SummaryItem icon={<Tags size={14} />} label="Kategori" value={kategoriPermintaanNama} />
            )}
            {detailPermintaanNama && (
              <SummaryItem
                icon={<Tags size={14} />}
                label="Detail"
                value={detailPermintaanNama}
                className="sm:col-span-2"
              />
            )}
            {isNonMaterial ? (
              <SummaryItem
                icon={<FileCheck2 size={14} />}
                label="Keterangan Detail"
                value={keteranganDetail || <span className="text-error">Belum diisi</span>}
                className="sm:col-span-2"
              />
            ) : (
              <SummaryItem
                icon={<Banknote size={14} />}
                label="Nominal Realisasi"
                value={nominalRealisasi ? `Rp ${nominalRealisasi}` : <span className="text-error">Belum diisi</span>}
                className="sm:col-span-2"
              />
            )}
          </div>

          <div className="mt-3 flex items-start gap-3 rounded-xl bg-orange-50/70 p-3">
            <FileCheck2 size={15} className="mt-0.5 shrink-0 text-orange-600" />
            <p className="text-[10px] font-semibold leading-relaxed text-zinc-700">
              {isNonMaterial
                ? 'Dokumen akan disimpan sebagai Tersimpan tanpa nominal realisasi.'
                : 'Dokumen akan mengikuti alur validasi dan persetujuan yang berlaku.'}
            </p>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-zinc-200/70 bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <FileCheck2 size={18} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-zinc-950">Ringkasan Kelengkapan</h4>
              <p className="text-[10px] font-medium text-zinc-500">
                {lampiranUrls.length} lampiran terunggah dan siap diperiksa
              </p>
            </div>
          </div>
          {lampiranUrls.length > 0 && (
            <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold text-emerald-700">
              Kelengkapan siap
            </span>
          )}
        </div>

        {lampiranUrls.length === 0 ? (
          <p className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-semibold text-error">
            Belum ada lampiran diunggah.
          </p>
        ) : (
          <ul className="grid min-w-0 gap-2 sm:grid-cols-2">
            {lampiranUrls.map(l => (
              <li
                key={l.kelengkapan_id}
                className="flex min-w-0 items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3"
              >
                <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-zinc-950">{l.nama}</p>
                  <p className="mt-0.5 truncate text-[9px] font-medium text-zinc-500">
                    {formatFileNameFromUrl(l.url)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
