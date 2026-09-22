import type { ReactNode } from 'react'
import {
  Building2,
  CheckCircle2,
  FileCheck2,
  Info,
  Tags,
} from 'lucide-react'

import type { LampiranUrl } from '#/lib/dokumen-helpers'
import { formatDate } from '#/lib/utils/format'

function formatFileNameFromUrl(url: string): string {
  return url.split('/').pop() ?? 'File'
}

type SummaryItemProps = {
  label: string
  value: ReactNode
  className?: string
}

function SummaryItem({ label, value, className = '' }: SummaryItemProps) {
  return (
    <div className={`min-w-0 rounded-lg border border-brand-border bg-bg-surface px-3 py-2.5 ${className}`}>
      <p className="text-[9px] font-semibold text-stone-400">{label}</p>
      <div className="mt-1 break-words text-[11px] font-semibold leading-relaxed text-stone-900">
        {value}
      </div>
    </div>
  )
}

type SummaryGroupProps = {
  icon: ReactNode
  title: string
  subtitle: string
  children: ReactNode
}

function SummaryGroup({ icon, title, subtitle, children }: SummaryGroupProps) {
  return (
    <section className="min-w-0 rounded-xl border border-brand-border bg-bg-surface p-3">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning-surface text-warning-solid">
          {icon}
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-bold text-stone-950">{title}</h4>
          <p className="mt-0.5 text-[9px] text-stone-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
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
  komponenNama?: string
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
  komponenNama,
  jenisPermintaanNama,
  kategoriPermintaanNama,
  detailPermintaanNama,
  keteranganDetail,
}: ReviewSummaryProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold text-[#B77900]">Ringkasan Pengajuan</p>
          <h3 className="mt-0.5 font-headline text-base font-bold tracking-tight text-stone-950">
            Periksa data sebelum konfirmasi
          </h3>
        </div>
        <span className="rounded-md bg-warning-surface px-2.5 py-1 text-[9px] font-semibold text-warning-text">
          {isNonMaterial ? 'Non-Material' : 'Material'}
        </span>
      </div>

      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <SummaryGroup
          icon={<Building2 size={15} />}
          title="Informasi Dokumen"
          subtitle="Fungsi, kegiatan, tanggal, dan peran"
        >
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <SummaryItem label="Fungsi" value={fungsiNama} />
            <SummaryItem label="Kegiatan" value={kegiatanNama} />
            <SummaryItem label="Tanggal Laporan" value={`${formatDate(tanggal)} - ${tahun}`} />
            <SummaryItem label="Peran" value={isKetuaTim ? 'Ketua Tim' : 'Anggota'} />
          </div>
        </SummaryGroup>

        <SummaryGroup
          icon={<Tags size={15} />}
          title="Karakteristik Dokumen"
          subtitle={isNonMaterial ? 'Nama dan keterangan dokumen' : 'Komponen, klasifikasi permintaan, dan nominal'}
        >
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            {!isNonMaterial && (
              <SummaryItem label="Komponen" value={komponenNama || '-'} className="sm:col-span-2" />
            )}
            <SummaryItem
              label={isNonMaterial ? 'Nama Dokumen' : 'Jenis Permintaan'}
              value={jenisPermintaanNama || '-'}
              className={isNonMaterial ? 'sm:col-span-2' : ''}
            />
            {!isNonMaterial && (
              <SummaryItem label="Kategori" value={kategoriPermintaanNama || '-'} />
            )}
            {!isNonMaterial && detailPermintaanNama && (
              <SummaryItem label="Detail" value={detailPermintaanNama} />
            )}
            <SummaryItem
              label={isNonMaterial ? 'Keterangan Detail (opsional)' : 'Nominal Realisasi'}
              value={isNonMaterial
                ? keteranganDetail || <span className="text-stone-400">Tidak diisi</span>
                : nominalRealisasi
                  ? <span className="font-mono font-bold text-stone-950">Rp {nominalRealisasi}</span>
                  : <span className="text-error">Belum diisi</span>}
              className="sm:col-span-2"
            />
          </div>
        </SummaryGroup>
      </div>

      <section className="rounded-xl border border-brand-border bg-bg-surface p-3">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-warning-surface text-warning-solid">
              <FileCheck2 size={15} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-stone-950">Kelengkapan Lampiran</h4>
              <p className="text-[9px] text-stone-500">Dokumen yang akan ikut diajukan</p>
            </div>
          </div>
          <span className="rounded-md bg-warning-surface px-2 py-1 text-[9px] font-semibold text-warning-text">
            {lampiranUrls.length} dokumen
          </span>
        </div>

        {lampiranUrls.length === 0 ? (
          <p className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs font-semibold text-error">
            Belum ada lampiran diunggah.
          </p>
        ) : (
          <ul className="grid min-w-0 gap-2 sm:grid-cols-2">
            {lampiranUrls.map(lampiran => (
              <li
                key={lampiran.kelengkapan_id}
                className="flex min-w-0 items-center gap-2.5 rounded-lg border border-brand-border bg-bg-surface px-3 py-2.5"
              >
                <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold text-stone-800">{lampiran.nama}</p>
                  <p className="mt-0.5 truncate text-[9px] text-stone-400">
                    {formatFileNameFromUrl(lampiran.url)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-warning-border bg-warning-surface p-3">
        <Info size={14} className="mt-0.5 shrink-0 text-warning-solid" />
        <div>
          <p className="text-[10px] font-semibold text-warning-text">
            {isNonMaterial
              ? 'Dokumen akan disimpan sebagai Tersimpan tanpa proses persetujuan.'
              : 'Dokumen akan dikirim ke PPK untuk mengikuti alur validasi dan persetujuan.'}
          </p>
          <p className="mt-0.5 text-[9px] leading-relaxed text-stone-500">
            Dengan mengajukan, Anda menyatakan data dan lampiran yang diberikan sudah benar.
          </p>
        </div>
      </div>
    </div>
  )
}
