import { Archive, FileText, Loader2, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '#/components/ui/button'
import { ConfirmDialog } from '#/components/ui/ConfirmDialog'
import { DatePicker } from '#/components/ui/date-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import {
  calculateBerkasDueDate,
  MANUAL_ARCHIVE_RETENTION_LABELS,
  type RetensiLabel,
} from '#/lib/archive/retention'
import { formatDate } from '#/lib/utils/format'

const ARCHIVE_FORM_LABEL_CLASS = 'block space-y-1.5 text-[11px] font-bold text-zinc-700'
const ARCHIVE_FORM_INPUT_CLASS =
  'w-full rounded-xl border border-brand-border bg-[#FFFAF6] px-4 py-2.5 text-sm font-semibold text-zinc-950 outline-none transition hover:border-brand-border-strong focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500 disabled:opacity-70'
const ARCHIVE_FORM_SELECT_TRIGGER_CLASS =
  'min-h-10 w-full rounded-xl border-brand-border bg-[#FFFAF6] px-4 text-sm font-semibold text-zinc-950 hover:border-brand-border-strong focus-visible:border-orange-300 focus-visible:ring-2 focus-visible:ring-orange-200/70'
const ARCHIVE_FORM_SELECT_CONTENT_CLASS =
  'rounded-xl border border-brand-border bg-bg-surface text-zinc-950 shadow-xl shadow-zinc-950/10'
const ARCHIVE_FORM_SELECT_ITEM_CLASS =
  'rounded-lg px-3 py-2 text-sm font-medium text-zinc-950 focus:bg-orange-50 focus:text-zinc-950'

export type CloseBerkasFormState = {
  nomor_spm: string
  // RP-01: satu field "Masa Simpan Minimal"; key `retensi_aktif` dipertahankan
  // sebagai identifier internal API. `retensi_inaktif` dibuang.
  retensi_aktif: string
  closed_at: string
}

export type CloseBerkasRequestBody = {
  nomor_spm: string
  retensi_aktif: string
  closed_at?: string
}

export type CloseBerkasSummary = {
  klasifikasiLabel: string
  itemCount: number
  totalNominalRealisasi: number | null
}

export const EMPTY_CLOSE_BERKAS_FORM: CloseBerkasFormState = {
  nomor_spm: '',
  retensi_aktif: '',
  closed_at: '',
}

export const EMPTY_BERKAS_CLOSE_MESSAGE =
  'Berkas belum memiliki dokumen. Tambahkan dokumen terlebih dahulu sebelum menutup berkas.'

export function buildCloseBerkasRequestBody(form: CloseBerkasFormState): CloseBerkasRequestBody {
  const body: CloseBerkasRequestBody = {
    nomor_spm: form.nomor_spm.trim(),
    retensi_aktif: form.retensi_aktif as RetensiLabel,
  }

  if (form.closed_at) body.closed_at = form.closed_at

  return body
}

export function isCloseBerkasFormIncomplete(form: CloseBerkasFormState): boolean {
  return !form.nomor_spm.trim() || !form.retensi_aktif
}

export function CloseBerkasDialog({
  open,
  form,
  pending,
  submitDisabled,
  onOpenChange,
  onFormChange,
  onSubmit,
  summary,
}: {
  open: boolean
  form: CloseBerkasFormState
  pending: boolean
  submitDisabled: boolean
  summary: CloseBerkasSummary
  onOpenChange: (open: boolean) => void
  onFormChange: (form: CloseBerkasFormState) => void
  onSubmit: () => void
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const retentionPreview = useMemo(() => getRetentionPreview(form), [form])

  useEffect(() => {
    if (!open) setConfirmOpen(false)
  }, [open])

  function handleSubmitClick() {
    if (submitDisabled) return
    setConfirmOpen(true)
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-brand-border bg-[#FFFAF6] p-0 shadow-2xl shadow-zinc-950/10 sm:max-w-3xl sm:rounded-3xl">
        <DialogHeader>
          <div className="px-5 pt-5 sm:px-7 sm:pt-7">
          <DialogTitle className="font-headline text-xl font-extrabold tracking-tight text-zinc-950 sm:text-2xl">
            Tutup berkas dan lengkapi metadata
          </DialogTitle>
          <DialogDescription className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-zinc-700">
            Setelah berkas ditutup, dokumen baru tidak dapat lagi dimasukkan ke cara pembayaran ini.
          </DialogDescription>
          <div className="sr-only">
            <p>Berkas akan difinalisasi menjadi Tersimpan.</p>
            <p>Setelah ditutup, Cara Pembayaran ini tidak bisa menerima dokumen baru.</p>
            <p>Dokumen dan file fisik tidak dihapus.</p>
            <p>Status berkas menjadi Ditutup dan statusnya menjadi Tersimpan.</p>
          </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 border-t border-[#F1E5DA] px-5 py-5 sm:px-7">
          <div className="rounded-2xl border border-[#F1E5DA] bg-bg-surface p-4 shadow-sm shadow-zinc-950/5">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
              Cara Pembayaran
            </p>
            <p className="mt-1 text-base font-extrabold tracking-tight text-zinc-950">
              {summary.klasifikasiLabel}
            </p>
            <div className="mt-4 grid gap-4 border-t border-[#F1E5DA] pt-4 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Jumlah Dokumen</p>
                <p className="mt-1 flex items-center gap-2 text-sm font-bold text-zinc-950">
                  <FileText size={14} className="text-brand-solid" />
                  {summary.itemCount}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Total Nominal Realisasi</p>
                <p className="mt-1 font-mono text-sm font-bold text-zinc-950">
                  {formatNominal(summary.totalNominalRealisasi)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className={ARCHIVE_FORM_LABEL_CLASS} htmlFor="close-berkas-nomor-spm">
              <span>Nomor SPM <span className="text-error">*</span></span>
              <input
                id="close-berkas-nomor-spm"
                value={form.nomor_spm}
                onChange={(event) => onFormChange({ ...form, nomor_spm: event.target.value })}
                className={ARCHIVE_FORM_INPUT_CLASS}
                maxLength={120}
                autoComplete="off"
              />
            </label>
            <label className={ARCHIVE_FORM_LABEL_CLASS} htmlFor="close-berkas-closed-at">
              <span>Tanggal SPM / Tanggal Tersimpan</span>
              <span className="sr-only">Tanggal Tutup</span>
              <DatePicker
                value={form.closed_at}
                disabled
                placeholder="Tanggal diisi otomatis"
              />
              <span className="mt-1 block text-[11px] font-semibold leading-relaxed text-zinc-500">
                Tanggal diisi otomatis dari tanggal sistem saat berkas ditutup.
              </span>
            </label>
            <label className={ARCHIVE_FORM_LABEL_CLASS} id="close-berkas-retensi-aktif-label">
              <span>Masa Simpan Minimal <span className="text-error">*</span></span>
              <Select value={form.retensi_aktif || null} onValueChange={(value) => onFormChange({ ...form, retensi_aktif: value ?? '' })}>
                <SelectTrigger className={ARCHIVE_FORM_SELECT_TRIGGER_CLASS} aria-labelledby="close-berkas-retensi-aktif-label">
                  <SelectValue placeholder="Pilih masa simpan">
                    {(value) => value || 'Pilih masa simpan'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className={ARCHIVE_FORM_SELECT_CONTENT_CLASS}>
                {MANUAL_ARCHIVE_RETENTION_LABELS.map((label) => (
                  <SelectItem key={label} value={label} className={ARCHIVE_FORM_SELECT_ITEM_CLASS}>{label}</SelectItem>
                ))}
                </SelectContent>
              </Select>
              <span className="mt-1 block text-[11px] font-semibold leading-relaxed text-zinc-500">
                Lama berkas wajib disimpan sebelum boleh diusulkan untuk pembersihan. "Permanen" berarti tidak pernah jatuh tempo.
              </span>
            </label>
          </div>

          {retentionPreview && (
            <div className="grid gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/55 px-5 py-4">
              <RetentionPreviewBadge
                label="Tanggal Jatuh Tempo"
                value={retentionPreview.tanggalJatuhTempo}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-3 border-[#F1E5DA] bg-bg-surface px-5 py-4 sm:px-7">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Batal
          </Button>
          <Button
            type="button"
            className="gap-1.5 rounded-xl bg-brand-solid px-5 font-extrabold text-white hover:bg-brand-solid-hover"
            onClick={handleSubmitClick}
            disabled={submitDisabled}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Simpan Metadata & Tutup Berkas
            <span className="sr-only">Finalisasi Berkas</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={confirmOpen}
      onOpenChange={(nextOpen) => { if (!pending) setConfirmOpen(nextOpen) }}
      tone="success"
      icon={<Archive className="size-6" />}
      title="Tutup berkas?"
      description="Berkas akan ditutup dan berstatus Tersimpan. Dokumen baru tidak dapat lagi dimasukkan ke cara pembayaran ini."
      confirmLabel="Tutup Berkas"
      cancelLabel="Batalkan"
      pending={pending}
      onConfirm={onSubmit}
    >
      <div className="rounded-2xl border border-[#F1E5DA] bg-bg-surface px-4 py-3 text-sm font-bold text-zinc-950">
        <div className="flex items-center justify-between gap-3">
          <span>Status berkas:</span>
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-extrabold text-amber-700">Ditutup</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span>Status:</span>
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-extrabold text-emerald-700">Tersimpan</span>
        </div>
      </div>
    </ConfirmDialog>
    </>
  )
}

function RetentionPreviewBadge({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">{label}</p>
      <p className="mt-2 font-mono text-xs font-black tracking-wide text-emerald-950">
        {formatDate(value)}
      </p>
    </div>
  )
}

function getRetentionPreview(form: CloseBerkasFormState): { tanggalJatuhTempo: string } | null {
  if (!form.closed_at || !form.retensi_aktif) return null

  try {
    return {
      tanggalJatuhTempo: calculateBerkasDueDate({
        closedAt: form.closed_at,
        masaSimpan: form.retensi_aktif as RetensiLabel,
      }),
    }
  } catch {
    return null
  }
}

function formatNominal(value: number | null): string {
  if (value === null) return '-'

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}
